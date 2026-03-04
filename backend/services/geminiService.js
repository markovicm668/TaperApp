const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getEnv } = require("../config/env");

const GEMINI_API_KEY = getEnv("GEMINI_API_KEY");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function analyzeResume({ resumeText, jobDescription }) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-pro-preview",
  });

  console.log("-> Gemini API call initiated with model: gemini-3-pro-preview");

  const prompt = `
You are an ATS resume optimizer. Focus on improving resume lines while preserving truthfulness.

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
  "rewrittenLines": [
    {
      "section": "experience" | "projects" | "skills" | "summary" (optional),
      "kind": "bullet" | "skills-category" | "skills-item" (optional),
      "category": string (optional, for skills-category or skills-item),
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
- Prioritize EXPERIENCE bullets, but include PROJECTS, SUMMARY, and SKILLS when there is an obvious improvement.
- For SKILLS edits, you may rewrite both skill category labels (for example: "Technical:") and skill entries inside a category.
- Do not invent new claims, employers, dates, tools, or achievements.
- "section" is optional, but when provided it must be one of: experience, projects, skills, summary.
- "kind" is optional, but when provided it must be one of: bullet, skills-category, skills-item.
- "category" is optional metadata for SKILLS rewrites.
- "original" must be verbatim from a resume line.
- "improved" should keep the same factual meaning while improving clarity and JD alignment.
- Keep missingKeywords, matchedKeywords, atsWarnings, suggestions empty if not obvious
`;

  console.log("-> Gemini rewrite prompt payload:", prompt);

  console.log("-> Gemini rewrite input data:", {
    resumeText,
    jobDescription,
    resumeTextLength: resumeText?.length ?? 0,
    jobDescriptionLength: jobDescription?.length ?? 0,
  });

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
