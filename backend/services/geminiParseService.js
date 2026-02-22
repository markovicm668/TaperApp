const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getEnv } = require("../config/env");
const { validateParsedPayload } = require("./aiContracts");
const { buildParsedPayload, normalizeStringArray } = require("./parseMappers");

const DEFAULT_MODEL = process.env.GEMINI_PARSE_MODEL || "gemini-3-pro-preview";
const MAX_GEMINI_ATTEMPTS = 2;

function createGeminiGenerateContent({ modelName = DEFAULT_MODEL } = {}) {
  const geminiClient = new GoogleGenerativeAI(getEnv("GEMINI_API_KEY"));
  const model = geminiClient.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1,
    },
  });

  return async (prompt) => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  };
}

function stripMarkdownFences(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJsonText(text) {
  const cleaned = stripMarkdownFences(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response does not contain JSON object boundaries.");
  }
  return cleaned.slice(start, end + 1);
}

function buildPrompt({ resumeText, inputType, fileName, repairReason }) {
  const repairInstruction = repairReason
    ? `\nREPAIR NOTE:\nPrevious output failed validation because: ${repairReason}\nFix this and return valid JSON only.\n`
    : "";

  return `You are a resume parser that extracts sections into strict JSON.

Task:
- First detect all sections exactly as they appear in the resume, in source order.
- Then map those sections to canonical targets.
- Parse canonical resume fields from mapped sections:
  - basics (id, name, title, email, phone, location object, profiles[])
  - summary string if provided
  - work[] (id, company, position, location object, startDate, endDate, isCurrent, highlights[] objects)
  - education[] (id, institution, degree, area, startDate, endDate, location object, optional gpa/honors)
  - projects[] (id, name, role, description, technologies[] objects, startDate, endDate, highlights[] objects)
  - awards[] (id, title, issuer, date, summary)
  - skills as array of objects ({ id, name, category })
  - languages[] (language, fluency)
- Include sectionOrder if confidently determined; otherwise leave empty.
- Include customSections only for non-canonical sections.
- Preserve original bullet meaning and ordering.
- Never invent achievements, employers, dates, or credentials.
- Unknown fields must be omitted or empty.
- Do not merge project sections into experience unless explicitly equivalent.
- If summary section is missing, sectionPresence.summary must be false.
- Output JSON only. No markdown, no prose.

Context:
- inputType: ${inputType}
- fileName: ${fileName || ""}

Output schema (JSON):
{
  "sections": [
    {
      "id": "string",
      "title": "string",
      "kind": "header | summary | work | projects | skills | education | awards | languages | custom",
      "canonicalTarget": "summary | work | projects | skills | education | awards | languages | none",
      "lines": ["string"]
    }
  ],
  "resumeData": {
    "basics": {
      "id": "string",
      "name": "string",
      "title": "string",
      "email": "string",
      "phone": "string",
      "location": {
        "city": "string",
        "country": "string"
      },
      "profiles": [
        {
          "id": "string",
          "network": "string",
          "url": "string"
        }
      ]
    },
    "summary": "string",
    "work": [
      {
        "id": "string",
        "company": "string",
        "position": "string",
        "location": { "city": "string", "country": "string" },
        "startDate": "string",
        "endDate": "string",
        "isCurrent": false,
        "highlights": [
          {
            "id": "string",
            "text": "string",
            "originalText": "string",
            "source": "user",
            "locked": false,
            "aiTags": [],
            "keywordMatches": []
          }
        ]
      }
    ],
    "education": [
      {
        "id": "string",
        "institution": "string",
        "degree": "string",
        "area": "string",
        "startDate": "string",
        "endDate": "string",
        "location": { "city": "string", "country": "string" },
        "gpa": "string",
        "honors": []
      }
    ],
    "projects": [
      {
        "id": "string",
        "name": "string",
        "role": "string",
        "description": "string",
        "technologies": [{ "skillRefId": "string", "name": "string" }],
        "startDate": "string",
        "endDate": "string",
        "repository": "string",
        "url": "string",
        "highlights": [
          {
            "id": "string",
            "text": "string",
            "originalText": "string",
            "source": "user"
          }
        ]
      }
    ],
    "awards": [{ "id": "string", "title": "string", "issuer": "string", "date": "string", "summary": "string" }],
    "skills": [{ "id": "string", "name": "string", "category": "technical" }],
    "languages": [{ "id": "string", "language": "string", "fluency": "string" }],
    "customSections": [{ "id": "string", "title": "string", "items": [{ "id": "string", "text": "string" }] }],
    "sectionOrder": ["summary", "work", "projects", "education", "skills", "awards", "languages", "customSections"],
    "versions": []
  },
  "sectionPresence": {
    "summary": false,
    "work": true,
    "projects": true,
    "skills": true,
    "education": true,
    "awards": true,
    "languages": true
  },
  "customSections": [
    {
      "id": "string",
      "title": "string",
      "kind": "custom",
      "canonicalTarget": "none",
      "lines": ["string"]
    }
  ],
  "notes": ["string"]
}
${repairInstruction}
Resume text:
${resumeText}`;
}

function normalizeInputText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
}

function mapModelOutputToPayload({
  modelOutput,
  normalizedText,
  inputType,
  fileName,
  serviceNotes,
}) {
  const modelPayload = JSON.parse(extractJsonText(modelOutput));
  const modelSections = [
    ...(Array.isArray(modelPayload && modelPayload.sections) ? modelPayload.sections : []),
    ...(Array.isArray(modelPayload && modelPayload.customSections)
      ? modelPayload.customSections
      : []),
  ];
  const modelResume =
    modelPayload &&
    typeof modelPayload === "object" &&
    !Array.isArray(modelPayload) &&
    modelPayload.resumeData &&
    typeof modelPayload.resumeData === "object"
      ? modelPayload.resumeData
      : modelPayload &&
          typeof modelPayload === "object" &&
          !Array.isArray(modelPayload) &&
          modelPayload.resume &&
          typeof modelPayload.resume === "object"
        ? modelPayload.resume
        : modelPayload;

  const payload = buildParsedPayload({
    resumeCandidate: modelResume,
    sectionBlocks: modelSections,
    resumeText: normalizedText,
    inputType,
    fileName,
    parserName: "gemini-section-parser-v2",
    notes: [...normalizeStringArray(modelPayload && modelPayload.notes), ...serviceNotes],
  });

  return payload;
}

async function parseResumeSections(
  { resumeText, inputType = "text", fileName },
  options = {}
) {
  const {
    validatePayload = validateParsedPayload,
  } = options;

  const normalizedText = normalizeInputText(resumeText);
  const serviceNotes = [];
  let attempt = 0;
  let lastError = null;
  let geminiGenerateContent = options.geminiGenerateContent;

  for (attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt += 1) {
    try {
      if (!geminiGenerateContent) {
        geminiGenerateContent = createGeminiGenerateContent();
      }

      const prompt = buildPrompt({
        resumeText: normalizedText,
        inputType,
        fileName,
        repairReason: lastError ? lastError.message : undefined,
      });

      const startedAt = Date.now();
      const modelOutput = await geminiGenerateContent(prompt);
      const elapsed = Date.now() - startedAt;

      const payload = mapModelOutputToPayload({
        modelOutput,
        normalizedText,
        inputType,
        fileName,
        serviceNotes,
      });

      const validated = validatePayload(payload);
      if (!validated.success) {
        throw new Error(validated.error.message || "Payload schema validation failed.");
      }

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          scope: "parse",
          source: "gemini",
          attempts: attempt,
          latencyMs: elapsed,
          responseChars: String(modelOutput || "").length,
        })
      );

      return {
        payload: validated.data,
        source: "gemini",
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          scope: "parse",
          source: "gemini",
          attempt,
          error: error && error.message ? error.message : "Unknown parse error",
        })
      );
    }
  }

  const parseError = new Error("Failed to parse resume with Gemini.");
  parseError.code = "PARSE_FAILED";
  parseError.details = {
    geminiError: lastError ? lastError.message : undefined,
  };
  throw parseError;
}

module.exports = {
  parseResumeSections,
  buildPrompt,
  extractJsonText,
  stripMarkdownFences,
  createGeminiGenerateContent,
};
