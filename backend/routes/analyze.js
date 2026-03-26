const express = require("express");
const multer = require("multer");
const router = express.Router();
const { analyzeResume } = require("../services/geminiService");
const { parseResumeSections } = require("../services/geminiParseService");
const { parseResumePdf } = require("../services/geminiPdfParseService");
const { claimReferralReward } = require("../services/referralService");

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

router.post("/", async (req, res) => {
  const routeStart = Date.now();
  try {
    const { resumeText, jobDescription, inputType, fileName, parsedResumeData } = req.body;
    console.log("-> Analysis request received.");
    console.log(`Resume length: ${resumeText?.length} chars, JD length: ${jobDescription?.length} chars, pre-parsed: ${Boolean(parsedResumeData)}`);

    if (!resumeText || !jobDescription) {
      console.error("-> Validation Error: Missing resumeText or jobDescription");
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "resumeText and jobDescription are required"
        }
      });
    }

    let parseResult;
    if (parsedResumeData) {
      console.log("-> Skipping parse (pre-parsed data provided). Running analysis...");
      parseResult = { payload: { resumeData: parsedResumeData } };
    } else {
      console.log("-> Step 1/2: Parsing resume...");
      const parseStart = Date.now();
      parseResult = await parseResumeSections({
        resumeText,
        inputType: inputType || "text",
        fileName,
      });
      console.log(`-> Parse complete in ${Date.now() - parseStart}ms. Step 2/2: Running analysis...`);
    }

    const analysisStart = Date.now();
    const result = await analyzeResume({ resumeText, jobDescription, parsedResumeData: parseResult.payload.resumeData });
    console.log(`-> Analysis complete in ${Date.now() - analysisStart}ms. Total route: ${Date.now() - routeStart}ms`);

    // Credit referrer on referee's first analysis (fire-and-forget)
    claimReferralReward(req.auth.uid).catch((err) =>
      console.error("-> Referral reward error:", err)
    );

    res.json({ success: true, data: result, parsed: parseResult.payload, tokensRemaining: req.tokensRemaining });

  } catch (err) {
    console.error("-> Analyze Error:", err);

    if (err.code === "PARSE_FAILED") {
      return res.status(500).json({
        error: {
          code: "PARSE_FAILED",
          message: err.message,
        }
      });
    }

    if (err.code === "AI_JSON_PARSE_FAILED") {
      return res.status(500).json({
        error: {
          code: "AI_JSON_PARSE_FAILED",
          message: err.message,
        }
      });
    }

    res.status(500).json({
      error: {
        code: "GEMINI_FAILURE",
        message: err.message
      }
    });
  }
});

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

router.post("/pdf", handleMulterUpload, async (req, res) => {
  const routeStart = Date.now();
  try {
    const { jobDescription, parsedResumeData: parsedResumeDataRaw } = req.body;

    if (!jobDescription) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "jobDescription is required.",
        },
      });
    }

    // If pre-parsed data is provided (from a prior /parse-pdf call), skip re-parsing
    let parsedResumeData = null;
    if (parsedResumeDataRaw) {
      try {
        parsedResumeData = typeof parsedResumeDataRaw === "string"
          ? JSON.parse(parsedResumeDataRaw)
          : parsedResumeDataRaw;
      } catch {
        console.warn("-> Failed to parse pre-parsed data, will re-parse PDF");
      }
    }

    let parseResultPayload;
    if (parsedResumeData) {
      console.log("-> PDF Analysis request received (pre-parsed, skipping PDF parse).");
      console.log(`JD length: ${jobDescription?.length} chars`);
      parseResultPayload = { resumeData: parsedResumeData };
    } else {
      if (!req.file) {
        return res.status(400).json({
          error: {
            code: "INVALID_INPUT",
            message: "A PDF file or parsedResumeData is required.",
          },
        });
      }

      console.log("-> PDF Analysis request received.");
      console.log(`PDF size: ${req.file.size} bytes, JD length: ${jobDescription?.length} chars`);

      console.log("-> Step 1/2: Parsing PDF resume...");
      const parseStart = Date.now();
      const parseResult = await parseResumePdf({
        pdfBuffer: req.file.buffer,
        fileName: req.file.originalname,
      });
      console.log(`-> PDF Parse complete in ${Date.now() - parseStart}ms. Step 2/2: Running analysis...`);
      parseResultPayload = parseResult.payload;
    }

    const analysisStart = Date.now();
    const result = await analyzeResume({
      resumeText: "",
      jobDescription,
      parsedResumeData: parseResultPayload.resumeData,
    });
    console.log(`-> PDF Analysis complete in ${Date.now() - analysisStart}ms. Total route: ${Date.now() - routeStart}ms`);

    claimReferralReward(req.auth.uid).catch((err) =>
      console.error("-> Referral reward error:", err)
    );

    res.json({
      success: true,
      data: result,
      parsed: parseResultPayload,
      tokensRemaining: req.tokensRemaining,
    });
  } catch (err) {
    console.error("-> Analyze PDF Error:", err);

    if (err.code === "PARSE_FAILED") {
      return res.status(500).json({
        error: { code: "PARSE_FAILED", message: err.message },
      });
    }

    if (err.code === "AI_JSON_PARSE_FAILED") {
      return res.status(500).json({
        error: { code: "AI_JSON_PARSE_FAILED", message: err.message },
      });
    }

    res.status(500).json({
      error: { code: "GEMINI_FAILURE", message: err.message },
    });
  }
});

module.exports = router;
