const express = require("express");
const router = express.Router();
const { analyzeResume } = require("../services/geminiService");
const { parseResumeSections } = require("../services/geminiParseService");
const { claimReferralReward } = require("../services/referralService");

router.post("/", async (req, res) => {
  const sw = { _start: Date.now(), _steps: [] };
  const lap = (label) => {
    const now = Date.now();
    const prev = sw._steps.length ? sw._steps[sw._steps.length - 1].at : sw._start;
    sw._steps.push({ label, ms: now - prev, at: now });
  };

  try {
    const { resumeText, jobDescription, inputType, fileName, parsedResumeData } = req.body;

    if ((!resumeText && !parsedResumeData) || !jobDescription) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "resumeText and jobDescription are required!"
        }
      });
    }

    let parseResult;
    if (parsedResumeData) {
      parseResult = { payload: { resumeData: parsedResumeData } };
      lap("parse (pre-parsed)");
    } else {
      parseResult = await parseResumeSections({
        resumeText,
        inputType: inputType || "text",
        fileName,
      });
      lap("gemini-parse");
    }

    const result = await analyzeResume({ resumeText, jobDescription, parsedResumeData: parseResult.payload.resumeData });
    lap("gemini-analyze");

    const total = Date.now() - sw._start;
    console.log(
      `\n⏱  [analyze] completed in ${total}ms\n` +
      sw._steps.map((s) => `   ${s.label.padEnd(20)} ${String(s.ms).padStart(6)}ms`).join("\n") +
      `\n   ${"TOTAL".padEnd(20)} ${String(total).padStart(6)}ms\n`
    );

    // Credit referrer on referee's first analysis (fire-and-forget).
    // Skipped for anonymous (free-trial) requests.
    if (req.auth?.uid) {
      claimReferralReward(req.auth.uid).catch((err) =>
        console.error("-> Referral reward error:", err)
      );
    }

    res.json({ success: true, data: result, parsed: parseResult.payload, tokensRemaining: req.tokensRemaining });

  } catch (err) {
    const total = Date.now() - sw._start;
    console.error(
      `\n⏱  [analyze] FAILED in ${total}ms: ${err.message}\n` +
      sw._steps.map((s) => `   ${s.label.padEnd(20)} ${String(s.ms).padStart(6)}ms`).join("\n") +
      (sw._steps.length ? "\n" : "")
    );

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

    if (err.code === "GEMINI_TIMEOUT") {
      return res.status(504).json({
        error: {
          code: "GEMINI_TIMEOUT",
          message: "The AI service took too long to respond. Please try again.",
        },
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

module.exports = router;
