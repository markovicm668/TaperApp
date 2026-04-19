const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getEnv } = require("../config/env");

const GEMINI_API_KEY = getEnv("GEMINI_API_KEY");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function serializeParsedResume(resumeData) {
  const lines = [];
  const { basics, summary, work, projects, skills, education, awards, languages } = resumeData || {};

  // Header
  if (basics) {
    const nameLine = [basics.name].filter(Boolean).join("");
    if (nameLine) lines.push(nameLine);

    const contactParts = [
      basics.title || basics.label,
      basics.email,
      basics.phone,
      basics.location
        ? [basics.location.city, basics.location.region, basics.location.country].filter(Boolean).join(", ")
        : null,
    ].filter(Boolean);
    if (contactParts.length) lines.push(contactParts.join(" | "));

    (basics.profiles || []).forEach((p) => {
      const label = p.network || p.username;
      const entry = label && p.url ? `${label}: ${p.url}` : p.url || label;
      if (entry) lines.push(entry);
    });
  }

  // Summary
  if (summary) {
    lines.push("");
    lines.push("SUMMARY");
    lines.push(summary);
  }

  // Experience
  const workEntries = Array.isArray(work) ? work.filter(Boolean) : [];
  if (workEntries.length) {
    lines.push("");
    lines.push("EXPERIENCE");
    workEntries.forEach((entry) => {
      const dateParts = [entry.startDate, entry.endDate || (entry.isCurrent ? "Present" : null)]
        .filter(Boolean)
        .join(" – ");
      const locationStr = entry.location
        ? [entry.location.city, entry.location.country].filter(Boolean).join(", ")
        : null;
      const heading = [
        entry.position && entry.company
          ? `${entry.position} at ${entry.company}`
          : entry.position || entry.company,
        dateParts,
        locationStr,
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(heading);
      (entry.highlights || []).forEach((h) => {
        if (h.text) lines.push(`[${h.id}] ${h.text}`);
      });
    });
  }

  // Projects
  const projectEntries = Array.isArray(projects) ? projects.filter(Boolean) : [];
  if (projectEntries.length) {
    lines.push("");
    lines.push("PROJECTS");
    projectEntries.forEach((entry) => {
      const dateParts = [entry.startDate, entry.endDate].filter(Boolean).join(" – ");
      const heading = [entry.name, dateParts].filter(Boolean).join(" | ");
      lines.push(heading);
      if (entry.role) lines.push(`Role: ${entry.role}`);
      const techs = (entry.technologies || []).map((t) => t.name).filter(Boolean).join(", ");
      if (techs) lines.push(`Technologies: ${techs}`);
      if (entry.description) lines.push(`Description: ${entry.description}`);
      (entry.highlights || []).forEach((h) => {
        if (h.text) lines.push(`[${h.id}] ${h.text}`);
      });
    });
  }

  // Skills
  const skillEntries = Array.isArray(skills) ? skills.filter(Boolean) : [];
  if (skillEntries.length) {
    lines.push("");
    lines.push("SKILLS");
    const byCategory = {};
    skillEntries.forEach((s) => {
      const cat = s.category || "Other";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(s.id ? `[${s.id}] ${s.name}` : s.name);
    });
    Object.entries(byCategory).forEach(([cat, entries]) => {
      lines.push(`${cat}: ${entries.join(", ")}`);
    });
  }

  // Education
  const educationEntries = Array.isArray(education) ? education.filter(Boolean) : [];
  if (educationEntries.length) {
    lines.push("");
    lines.push("EDUCATION");
    educationEntries.forEach((entry) => {
      const degree = [entry.degree, entry.area].filter(Boolean).join(" ");
      const dateParts = [entry.startDate, entry.endDate].filter(Boolean).join(" – ");
      const entryLine = [entry.institution, degree, dateParts].filter(Boolean).join(" | ");
      if (entryLine) lines.push(entryLine);
      if (entry.gpa) lines.push(`GPA: ${entry.gpa}`);
      (entry.honors || []).forEach((h) => h && lines.push(`- ${h}`));
    });
  }

  // Awards
  const awardEntries = Array.isArray(awards) ? awards.filter(Boolean) : [];
  if (awardEntries.length) {
    lines.push("");
    lines.push("AWARDS");
    awardEntries.forEach((entry) => {
      const heading = [entry.title, entry.issuer, entry.date].filter(Boolean).join(" – ");
      if (heading) lines.push(heading);
      if (entry.summary) lines.push(`  ${entry.summary}`);
    });
  }

  // Languages
  const languageEntries = Array.isArray(languages) ? languages.filter(Boolean) : [];
  if (languageEntries.length) {
    lines.push("");
    lines.push("LANGUAGES");
    lines.push(
      languageEntries
        .map((l) => (l.fluency ? `${l.language} (${l.fluency})` : l.language))
        .filter(Boolean)
        .join(", ")
    );
  }

  return lines.join("\n");
}

async function analyzeResume({ resumeText, jobDescription, parsedResumeData }) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
  });

  const resumeForPrompt = parsedResumeData
    ? serializeParsedResume(parsedResumeData)
    : resumeText;

    console.log("-> Serialized resume for prompt:", resumeForPrompt);

  // const prompt = `
  // You are an ATS resume optimizer. You improve EXPERIENCE section bullets AND the SKILLS section.

  // JOB DESCRIPTION:
  // ${jobDescription}

  // RESUME:
  // ${resumeForPrompt}

  // Return STRICT JSON ONLY with this schema:
  // {
  //   "matchScore": number (0-100),
  //   "overallFit": "poor" | "fair" | "good" | "great",
  //   "targetRole": string,
  //   "company": string,
  //   "roleSeniority": "junior" | "mid" | "senior" | "lead" | "executive",
  //   "rewrittenBullets": [
  //     {
  //       "section": "experience" | "projects" | "skills",
  //       "type": "modified" | "added" | "removed",
  //       "original": string,
  //       "improved": string,
  //       "rationale": string
  //     }
  //   ],
  //   "skillCategoryRenames": [
  //     { "from": "exact current category name", "to": "new category name" }
  //   ]
  // }

  // Rules:
  // - Output valid JSON only
  // - No markdown
  // - No commentary outside JSON
  // - Ensure matchScore is an integer
  // - Infer targetRole and company from the JOB DESCRIPTION (or use empty string if unknown)
  // - "section" must be one of: experience, projects, skills

  // EXPERIENCE bullets (section: "experience" or "projects"):
  // - For each bullet, provide one improved version that is action-led and aligned to the JOB DESCRIPTION
  // - Do not invent new bullets
  // - "original" must be verbatim from the resume bullet text
  // - "improved" should be one bullet line, action-led, and aligned to the JD
  // - type must be "modified"

  // SKILLS (section: "skills"):
  // - Suggest skill additions that are clearly required or preferred by the JOB DESCRIPTION but missing from the resume (type: "added", original: "", improved: "[CategoryName] skill name" — prefix with the target category in square brackets). IMPORTANT: the CategoryName MUST be one of the exact category names already present in the resume (e.g. if the resume has "Soft", use "[Soft]" not "[Soft Skills]"). Only create a new category name if no existing category is a reasonable fit.
  // - Feel free to to change any skill and any category names to be more aligned with the JOB DESCRIPTION (type: "modified", original: "SkillName" or "CategoryName", improved: "NewName")
  // - Remove skills that are clearly not relevant to the JOB DESCRIPTION (type: "removed", original: "SkillName", improved: "")
  // - Do not add or remove more than 5 skills in total
  // - For category renames, only rename if it improves alignment with the JOB DESCRIPTION
  // - Try to keep the same number of skills in each category unless the JOB DESCRIPTION indicates a clear need for more or fewer skills in that category
  // - Try not to have less than 2 skills in a category

  // `;

  const prompt = `
You are an ATS resume optimization engine.

Your task is to compare the provided resume against the job description and produce structured, conservative improvements.

  JOB DESCRIPTION:
  ${jobDescription}

  RESUME:
  ${resumeForPrompt}

You must follow this process internally before generating output:
1. Infer the target role, company, seniority, and most important keywords from the job description.
2. Identify the most important required skills, tools, responsibilities, and soft skills.
3. Compare the resume against those requirements.
4. Rewrite existing resume to better match the job description while preserving the truth of the original resume.
5. Suggest only the most important missing skills.
6. Remove only skills that are clearly irrelevant.
7. Use only IDs provided in the original resume data — do not invent new IDs.

Do not include markdown, explanations, or text outside JSON.
Return STRICT JSON ONLY with this schema:
  {
  "meta": {
    "matchScore": number,
    "overallFit": "poor" | "fair" | "good" | "great",
    "targetRole": string,
    "company": string,
    "roleSeniority": "junior" | "mid" | "senior" | "lead" | "executive"
  },

  "highlights": {
    "update": [
      {
        "id": string,
        "text": string
      }
    ]
  },

  "categories": {
    "rename": [
      {
        "from": string,
        "to": string
      }
    ]
  },

  "skills": {
    "add": [
      {
        "name": string,
        "category": string
      }
    ],
    "remove": [
      {
        "id": string
      }
    ]
  }
}

Rules:
- Output valid JSON only
- matchScore must be an integer from 0 to 100
- overallFit rules:
  - 0-39 = poor
  - 40-59 = fair
  - 60-79 = good
  - 80-100 = great
- Infer targetRole and company from the job description
- Use empty string if unknown
- Do not invent technologies, metrics, achievements, or responsibilities
- Do not suggest experience the candidate does not already appear to have
- You may strengthen wording, improve ATS keyword alignment, and make bullets more action-oriented
- Use concise, professional language
- Prefer strong action verbs such as Led, Built, Managed, Improved, Designed, Implemented, Coordinated, Optimized

HIGHLIGHTS RULES:
- Only rewrite bullets that would materially benefit ATS alignment
- id must exactly match the bullet from the resume
- improved must be a stronger but truthful version of the original bullet, optimized for ATS and aligned to the JD
- Prioritize bullets related to the most important JD requirements
- Do not rewrite every bullet if some are already strong

SKILLS RULES:
  - Suggest skill additions that are clearly required or preferred by the JOB DESCRIPTION but missing from the resume
  - Feel free to to change any skill and any category names to be more aligned with the JOB DESCRIPTION
  - Remove skills that are clearly not relevant to the JOB DESCRIPTION
  - For category renames, only rename if it improves alignment with the JOB DESCRIPTION
  - Try to keep the same number of skills in each category unless the JOB DESCRIPTION indicates a clear need for more or fewer skills in that category
  - Do not have less than 2 skills in a category

SUMMARY RULES:
- If the resume has a summary/profile section, rewrite it to better target the specific role in the JOB DESCRIPTION
- Preserve the candidate's actual experience level, tone, and factual claims — do not invent new experience or embellish existing experience
- Improve ATS alignment by naturally incorporating appropriate important keywords from the JD
- Aim for the same length and style as the original summary
- Return updated summary in highlights section with exactly the same ID as the original summary
`;
  console.log("-> Gemini rewrite input data:", {
    usingParsedResume: Boolean(parsedResumeData),
    resumeForPromptLength: resumeForPrompt?.length ?? 0,
    jobDescriptionLength: jobDescription?.length ?? 0,
  });

  const analyzeStart = Date.now();
  const result = await model.generateContent(prompt);
  console.log(`-> Gemini analysis call took ${Date.now() - analyzeStart}ms`);

  const outputText = result.response.text();

  console.log("-> Gemini API call completed. Raw output:", outputText);

  try {
    const parsed = JSON.parse(outputText);
    console.log("-> Parsed Gemini output:", JSON.stringify(parsed, null, 2));
    return parsed;
  } catch (e) {
    console.error("-> JSON Parsing Failed in service. Raw AI Output:", outputText.slice(0, 500) + '...');
    const jsonError = new Error("AI returned invalid JSON structure.");
    jsonError.code = "AI_JSON_PARSE_FAILED";
    throw jsonError;
  }
}

module.exports = { analyzeResume, serializeParsedResume };
