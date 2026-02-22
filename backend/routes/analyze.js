const express = require("express");
const router = express.Router();
const { analyzeResume } = require("../services/geminiService");

router.post("/", async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;
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

    const result = await analyzeResume({ resumeText, jobDescription });

    console.log("-> Analysis Successful, returning data.");
    
    res.json({ success: true, data: result });

  } catch (err) {
    console.error("-> Analyze Error:", err);

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
