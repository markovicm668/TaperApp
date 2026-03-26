const express = require("express");
const multer = require("multer");
const { parseResumePdf } = require("../services/geminiPdfParseService");

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
  const startedAt = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "A PDF file is required.",
        },
      });
    }

    const parseResult = await parseResumePdf({
      pdfBuffer: req.file.buffer,
      fileName: req.file.originalname,
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        scope: "parse-pdf-route",
        statusCode: 200,
        source: parseResult.source,
        attempts: parseResult.attempts,
        latencyMs: Date.now() - startedAt,
      })
    );

    return res.status(200).json({
      success: true,
      data: parseResult.payload,
      tokensRemaining: req.tokensRemaining,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("-> Parse PDF Error:", error);

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
