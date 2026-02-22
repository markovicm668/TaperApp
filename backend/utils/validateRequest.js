function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const ALLOWED_INPUT_TYPES = new Set(["file", "text", "linkedin"]);
const MAX_RESUME_TEXT_LENGTH = 120000;

function validateAnalyzeRequest(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    errors.push({ field: "body", message: "Request body must be a JSON object." });
    return { ok: false, errors };
  }

  if (!isNonEmptyString(body.resumeText)) {
    errors.push({ field: "resumeText", message: "resumeText is required." });
  }

  if (!isNonEmptyString(body.jobDescription)) {
    errors.push({ field: "jobDescription", message: "jobDescription is required." });
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      resumeText: body.resumeText.trim(),
      jobDescription: body.jobDescription.trim(),
    },
  };
}

function validateParseRequest(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    errors.push({ field: "body", message: "Request body must be a JSON object." });
    return { ok: false, errors };
  }

  if (!isNonEmptyString(body.resumeText)) {
    errors.push({ field: "resumeText", message: "resumeText is required." });
  } else if (body.resumeText.length > MAX_RESUME_TEXT_LENGTH) {
    errors.push({
      field: "resumeText",
      message: `resumeText exceeds maximum length (${MAX_RESUME_TEXT_LENGTH} chars).`,
    });
  }

  if (body.inputType !== undefined && !ALLOWED_INPUT_TYPES.has(body.inputType)) {
    errors.push({
      field: "inputType",
      message: "inputType must be one of: file, text, linkedin.",
    });
  }

  if (body.fileName !== undefined && body.fileName !== null && !isNonEmptyString(body.fileName)) {
    errors.push({
      field: "fileName",
      message: "fileName must be a non-empty string when provided.",
    });
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      resumeText: body.resumeText.trim(),
      inputType: body.inputType || "text",
      fileName: body.fileName ? body.fileName.trim() : undefined,
    },
  };
}

module.exports = {
  validateAnalyzeRequest,
  validateParseRequest,
};
