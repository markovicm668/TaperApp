const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getEnv } = require("../config/env");
const { validateParsedPayload } = require("./aiContracts");
const { buildParsedPayload, normalizeStringArray } = require("./parseMappers");

const DEFAULT_MODEL = "gemini-3.6-flash";
const MAX_GEMINI_ATTEMPTS = 2;
const GEMINI_TIMEOUT_MS = 120_000;

function createGeminiGenerateContent({ modelName = DEFAULT_MODEL } = {}) {
  const geminiClient = new GoogleGenerativeAI(getEnv("GEMINI_API_KEY"));
  const model = geminiClient.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  return async (prompt) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const result = await model.generateContent(prompt, {
        signal: controller.signal,
      });
      return result.response.text();
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Gemini API timed out after ${GEMINI_TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
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
  const raw = cleaned.slice(start, end + 1);
  // Escape raw control characters that break JSON.parse (common in Gemini JSON mode)
  return raw.replace(/[\x00-\x1f]/g, (ch) => {
    const esc = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
    return esc[ch] || '';
  });
}

function buildPrompt({ resumeText, inputType, fileName, repairReason, hyperlinks }) {
  const repairInstruction = repairReason
    ? `\nREPAIR NOTE:\nPrevious output failed validation because: ${repairReason}\nFix this and return valid JSON only.\n`
    : "";

  const hyperlinksList = Array.isArray(hyperlinks) ? hyperlinks : [];
  const hyperlinksBlock = hyperlinksList.length
    ? `\n\nHyperlinks (text → url) detected in source PDF:\n` +
      hyperlinksList
        .map((h) => `- "${(h && h.text) || ""}" → ${(h && h.url) || ""}`)
        .join("\n")
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
  - projects[] (id, name, role, technologies[] objects, startDate, endDate, highlights[] objects)
  - awards[] (id, title, issuer, date, summary)
  - skills as array of objects ({ id, name, category })
  - languages[] (language, fluency)
- Include sectionOrder if confidently determined; otherwise leave empty.
- customSections are ONLY for content under a genuine non-canonical heading (e.g. Volunteering, Certifications, Publications, Interests). Do NOT create a custom / "Unstructured" / "Other" section for bullets you have mapped into canonical sections. If a block of bullets is detached from its heading in the source text (common with PDF extraction), map each bullet to the correct canonical entry by context and do NOT also emit it as a customSection. Never output the same line in both a canonical section and a customSection.
- Preserve original bullet meaning and ordering.
- Never invent achievements, employers, dates, or credentials.
- Unknown fields must be omitted or empty.
- Do not merge project sections into experience unless explicitly equivalent.
- If summary section is missing, sectionPresence.summary must be false.
- If a "Hyperlinks" list is provided after the resume text, prefer those URLs when filling basics.profiles[].url, projects[].url, projects[].repository, and any work/project highlight that references an external resource. Match each URL to the right field by surrounding text context (e.g. a link whose text is "LinkedIn" or that points to linkedin.com belongs in basics.profiles, while a github.com URL near a project belongs in projects[].repository). Do not invent profiles or projects just because a URL exists.
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
    "skills": [{ "id": "string", "name": "string", "category": "string (the category label as it appears in the resume, e.g. 'E-commerce platforms', 'Tools', 'Soft skills')" }],
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
${resumeText}${hyperlinksBlock}`;
}

function parseModelJson(text) {
  const cleaned = String(text || "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (directError) {
    try {
      const extracted = extractJsonText(cleaned);
      return JSON.parse(extracted);
    } catch (extractError) {
      throw new Error(
        `Failed to parse Gemini JSON.\n` +
        `Direct parse error: ${directError.message}\n` +
        `Extract parse error: ${extractError.message}\n` +
        `Raw output preview: ${cleaned.slice(0, 500)}`
      );
    }
  }
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
  // const modelPayload = JSON.parse(extractJsonText(modelOutput));
  const modelPayload = parseModelJson(modelOutput);
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
  { resumeText, inputType = "text", fileName, hyperlinks = [] },
  options = {}
) {
  const {
    validatePayload = validateParsedPayload,
  } = options;

  const normalizedText = normalizeInputText(resumeText);
  const serviceNotes = [];
  let attempt = 0;
  let lastError = null;
  const geminiGenerateContent =
    options.geminiGenerateContent || createGeminiGenerateContent();

  for (attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt += 1) {
    try {
      if (!geminiGenerateContent) {
        geminiGenerateContent = createGeminiGenerateContent();
      }

      const prompt = buildPrompt({
        resumeText: normalizedText,
        inputType,
        fileName,
        hyperlinks,
        repairReason: lastError && !lastError.message?.includes("timed out")
          ? lastError.message
          : undefined,
      });

      const startedAt = Date.now();
      const modelOutput = await geminiGenerateContent(prompt);
      const elapsed = Date.now() - startedAt;

      // eslint-disable-next-line no-console
      // console.log("-> Gemini parse raw output:\n", modelOutput);

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
      // console.log(
      //   JSON.stringify({
      //     scope: "parse",
      //     source: "gemini",
      //     attempts: attempt,
      //     latencyMs: elapsed,
      //     responseChars: String(modelOutput || "").length,
      //   })
      // );

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
  parseModelJson,
};
