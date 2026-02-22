const express = require("express");
const { validateParseRequest } = require("../utils/validateRequest");
const { parseResumeSections } = require("../services/geminiParseService");

function createParseRouter({ parseResume = parseResumeSections } = {}) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    const startedAt = Date.now();

    try {
      const validation = validateParseRequest(req.body);
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

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          scope: "parse-route",
          statusCode: 200,
          source: parseResult.source,
          attempts: parseResult.attempts,
          latencyMs: Date.now() - startedAt,
        })
      );

      return res.status(200).json({
        success: true,
        data: parseResult.payload,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("-> Parse Error:", error);

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
