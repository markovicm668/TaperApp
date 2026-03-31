const express = require("express");
const { validateParseRequest } = require("../utils/validateRequest");
const { parseResumeSections } = require("../services/geminiParseService");

function createParseRouter({ parseResume = parseResumeSections } = {}) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    const sw = { _start: Date.now(), _steps: [] };
    const lap = (label) => {
      const now = Date.now();
      const prev = sw._steps.length ? sw._steps[sw._steps.length - 1].at : sw._start;
      sw._steps.push({ label, ms: now - prev, at: now });
    };

    try {
      const validation = validateParseRequest(req.body);
      lap("validation");
      if (!validation.ok) {
        return res.status(400).json({
          error: {
            code: "INVALID_INPUT",
            message: "Invalid parse request payload.",
            details: validation.errors,
          },
        });
      }

      const { resumeText, inputType, fileName } = validation.data;

      const parseResult = await parseResume({ resumeText, inputType, fileName });
      lap("gemini-parse");

      const total = Date.now() - sw._start;
      console.log(
        `\n⏱  [parse] completed in ${total}ms\n` +
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
      console.error(`\n⏱  [parse] FAILED in ${total}ms: ${error.message}`);

      const statusCode = error.code === "INVALID_INPUT" ? 400 : 500;
      const code = statusCode === 400 ? "INVALID_INPUT" : "PARSE_FAILED";
      const message =
        code === "PARSE_FAILED" ? error.message : "Invalid parse request payload.";

      return res.status(statusCode).json({
        error: {
          code,
          message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }
  });

  return router;
}

module.exports = createParseRouter();
module.exports.createParseRouter = createParseRouter;
