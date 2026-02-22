const { aiParsedResumePayloadSchema } = require('@resume-scanner/resume-contract');

function validateParsedPayload(payload) {
  return aiParsedResumePayloadSchema.safeParse(payload);
}

module.exports = {
  validateParsedPayload,
};
