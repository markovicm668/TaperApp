const express = require("express");
const multer = require("multer");
const { PDFParse } = require("pdf-parse");
const { parseResumeSections } = require("../services/geminiParseService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed."));
    }
  },
});

const router = express.Router();

function handleMulterUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      console.error("-> Multer upload error:", err.message);
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({
        error: { code: "UPLOAD_ERROR", message: err.message },
      });
    }
    next();
  });
}

router.post("/", handleMulterUpload, async (req, res) => {
  const sw = { _start: Date.now(), _steps: [] };
  const lap = (label) => {
    const now = Date.now();
    const prev = sw._steps.length ? sw._steps[sw._steps.length - 1].at : sw._start;
    sw._steps.push({ label, ms: now - prev, at: now });
  };

  try {
    if (!req.file) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "A PDF file is required.",
        },
      });
    }

    lap("upload");

    // Extract text and hyperlinks from PDF
    let extractedText;
    let hyperlinks = [];
    try {
      const parser = new PDFParse({ data: req.file.buffer });
      await parser.load();
      const textResult = await parser.getText();
      try {
        const infoResult = await parser.getInfo({ parsePageInfo: true });
        const pageLinks = Array.isArray(infoResult && infoResult.pages) ? infoResult.pages : [];
        const seen = new Set();
        for (const page of pageLinks) {
          const links = Array.isArray(page && page.links) ? page.links : [];
          for (const link of links) {
            const url = typeof link?.url === "string" ? link.url.trim() : "";
            if (!url) continue;
            if (/^(mailto:|tel:)/i.test(url)) continue;
            const text = typeof link?.text === "string" ? link.text.trim() : "";
            const key = `${text}|${url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            hyperlinks.push({ text, url });
            if (hyperlinks.length >= 50) break;
          }
          if (hyperlinks.length >= 50) break;
        }
      } catch (linkErr) {
        console.warn("-> [pdf-parse] hyperlink extraction failed:", linkErr.message);
        hyperlinks = [];
      }
      await parser.destroy();
      await new Promise(resolve => setImmediate(resolve));
      extractedText = textResult.text;
    } catch (err) {
      console.error(`-> [pdf-parse] FAILED:`, err.message);
      const parseError = new Error("Failed to read PDF file. It may be corrupted or password-protected.");
      parseError.code = "PARSE_FAILED";
      throw parseError;
    }

    if (!extractedText || !extractedText.trim()) {
      const err = new Error("Could not extract text from PDF. The file may be scanned/image-only.");
      err.code = "PARSE_FAILED";
      throw err;
    }
    lap("pdf-extract");
    if (hyperlinks.length) {
      console.log(`-> [pdf-parse] extracted ${hyperlinks.length} hyperlink(s)`);
    }

    const parseResult = await parseResumeSections({
      resumeText: extractedText,
      inputType: "file",
      fileName: req.file.originalname,
      hyperlinks,
    });
    lap("gemini-parse");

    const total = Date.now() - sw._start;
    console.log(
      `\n⏱  [parse-pdf] completed in ${total}ms\n` +
      sw._steps.map((s) => `   ${s.label.padEnd(20)} ${String(s.ms).padStart(6)}ms`).join("\n") +
      `\n   ${"TOTAL".padEnd(20)} ${String(total).padStart(6)}ms\n`
    );

    return res.status(200).json({
      success: true,
      data: parseResult.payload,
      tokensRemaining: req.tokensRemaining,
    });
  } catch (error) {
    const total = Date.now() - sw._start;
    console.error(`\n⏱  [parse-pdf] FAILED in ${total}ms: ${error.message}`);

    if (error.message === "Only PDF files are allowed.") {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: error.message,
        },
      });
    }

    const statusCode = error.code === "INVALID_INPUT" ? 400 : 500;
    const code = statusCode === 400 ? "INVALID_INPUT" : "PARSE_FAILED";

    return res.status(statusCode).json({
      error: {
        code,
        message: error.message || "Failed to parse PDF.",
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }
});

module.exports = router;
