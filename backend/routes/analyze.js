const express = require("express");
const router = express.Router();
const { analyzeResume } = require("../services/geminiService");
const { parseResumeSections } = require("../services/geminiParseService");
const { claimReferralReward } = require("../services/referralService");
const { createApplication } = require("../services/applicationService");
const { isAnonymousRequest } = require("../utils/authClaims");

router.post("/", async (req, res) => {
  const sw = { _start: Date.now(), _steps: [] };
  const lap = (label) => {
    const now = Date.now();
    const prev = sw._steps.length ? sw._steps[sw._steps.length - 1].at : sw._start;
    sw._steps.push({ label, ms: now - prev, at: now });
  };

  try {
    const { resumeText, jobDescription, inputType, fileName, parsedResumeData, parsedResumePayload } = req.body;

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
      // Prefer the full parse payload (source, sections) when the client
      // sends it, so the saved application can be re-opened with full
      // fidelity; fall back to wrapping the bare resumeData.
      const payload =
        parsedResumePayload && parsedResumePayload.resumeData
          ? parsedResumePayload
          : { resumeData: parsedResumeData };
      parseResult = { payload };
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

    // Every request is authenticated now (anonymous or real), so gate the
    // real-account-only side effects on the caller not being anonymous.
    const isRealUser = !isAnonymousRequest(req);

    // Credit referrer on referee's first analysis (fire-and-forget).
    // Skipped for anonymous (free-trial) requests.
    if (isRealUser) {
      claimReferralReward(req.auth.uid).catch((err) =>
        console.error("-> Referral reward error:", err)
      );
    }

    // Persist the analysis as a tracked application for signed-in users.
    // Anonymous (free-trial) analyses are not saved. A save failure must
    // never fail the analysis the user already paid for.
    let applicationId = null;
    if (isRealUser) {
      try {
        const created = await createApplication(req.auth.uid, {
          company: result?.meta?.company || "",
          targetRole: result?.meta?.targetRole || "",
          jobDescription,
          matchScore: result?.meta?.matchScore,
          scores: result?.meta?.scores || null,
          analysis: result,
          parsed: parseResult.payload,
        });
        applicationId = created.id;
      } catch (saveErr) {
        console.error("-> Save application error:", saveErr);
      }
    }

    res.json({ success: true, data: result, parsed: parseResult.payload, applicationId, tokensRemaining: req.tokensRemaining });

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
