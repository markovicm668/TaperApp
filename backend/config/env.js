const path = require("path");
const dotenv = require("dotenv");

// Load .env from backend/ by default
dotenv.config({ path: path.join(process.cwd(), ".env") });

function getEnv(name, { required = true } = {}) {
  const value = process.env[name];
  if (required && (!value || !String(value).trim())) {
    const err = new Error(`Missing required environment variable: ${name}`);
    err.code = "MISSING_ENV";
    throw err;
  }
  return value;
}

module.exports = {
  getEnv,
};

