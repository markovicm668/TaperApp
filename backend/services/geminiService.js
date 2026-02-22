const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getEnv } = require("../config/env");

const GEMINI_API_KEY = getEnv("GEMINI_API_KEY");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function analyzeResume({ resumeText, jobDescription }) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3-pro-preview",
  });

  console.log("-> Gemini API call initiated with model: gemini-3-pro-preview");

  const prompt = `
You are an ATS resume bullet optimizer. Your sole focus is improving EXPERIENCE section bullets.

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeText}

Return STRICT JSON ONLY with this schema:
{
  "matchScore": number (0-100),
  "overallFit": "poor" | "fair" | "good" | "great",
  "targetRole": string,
  "company": string,
  "roleSeniority": "junior" | "mid" | "senior" | "lead" | "executive",
  "missingKeywords": string[],
  "matchedKeywords": string[],
  "rewrittenBullets": [
    {
      "section": "experience" | "projects" | "skills" | "summary" (optional),
      "original": string,
      "improved": string,
      "rationale": string
    }
  ],
  "atsWarnings": string[],
  "suggestions": string[]
}

Rules:
- Output valid JSON only
- No markdown
- No commentary outside JSON
- Ensure matchScore is an integer
- Infer targetRole and company from the JOB DESCRIPTION (or use empty string if unknown)
- Focus exclusively on EXPERIENCE section bullets in the RESUME
- For each bullet, provide one improved version that is action-led and aligned to the JOB DESCRIPTION
- Do not invent new bullets
- "section" is optional, but when provided it must be one of: experience, projects, skills, summary
- "original" must be verbatim from the resume bullet text
- "improved" should be one bullet line, action-led, and aligned to the JD
- Keep missingKeywords, matchedKeywords, atsWarnings, suggestions empty if not obvious
`;

  const result = await model.generateContent(prompt);

  const outputText = result.response.text();

  try {
    const parsed = JSON.parse(outputText);
    return parsed;
  } catch (e) {
    console.error("-> JSON Parsing Failed in service. Raw AI Output:", outputText.slice(0, 500) + '...');
    const jsonError = new Error("AI returned invalid JSON structure.");
    jsonError.code = "AI_JSON_PARSE_FAILED";
    throw jsonError;
  }
}

module.exports = { analyzeResume };
