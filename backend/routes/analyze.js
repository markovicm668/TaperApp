const express = require("express");
const router = express.Router();
const { analyzeResume } = require("../services/geminiService");
const { parseResumeSections } = require("../services/geminiParseService");

router.post("/", async (req, res) => {
  try {
    const { resumeText, jobDescription, inputType, fileName } = req.body;
    console.log("-> Analysis request received.");
    console.log(`Resume length: ${resumeText?.length} chars, JD length: ${jobDescription?.length} chars`);

    if (!resumeText || !jobDescription) {
      console.error("-> Validation Error: Missing resumeText or jobDescription");
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "resumeText and jobDescription are required"
        }
      });
    }

    console.log("-> Step 1/2: Parsing resume...");
    const parseResult = await parseResumeSections({
      resumeText,
      inputType: inputType || "text",
      fileName,
    });
    console.log("-> Parse complete. Step 2/2: Running analysis...");

    const result = await analyzeResume({ resumeText, jobDescription, parsedResumeData: parseResult.payload.resumeData });

    console.log("-> Analysis Successful, returning data.");

    res.json({ success: true, data: result, parsed: parseResult.payload });

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

module.exports = router;
