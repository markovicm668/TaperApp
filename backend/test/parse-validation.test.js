const test = require("node:test");
const assert = require("node:assert/strict");

const { validateParseRequest } = require("../utils/validateRequest");

test("validateParseRequest accepts valid payload with defaults", () => {
  const result = validateParseRequest({
    resumeText: "Senior Software Engineer\nBuilt APIs",
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.inputType, "text");
  assert.equal(result.data.fileName, undefined);
  assert.equal(result.data.resumeText, "Senior Software Engineer\nBuilt APIs");
});

test("validateParseRequest rejects missing resumeText", () => {
  const result = validateParseRequest({
    inputType: "text",
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, "resumeText");
});

test("validateParseRequest rejects unknown inputType", () => {
  const result = validateParseRequest({
    resumeText: "Resume",
    inputType: "docx",
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, "inputType");
});

