const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

let initialized = false;

function normalizeServiceAccount(parsed) {
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    const err = new Error(
      "Firebase service account must include project_id, client_email, and private_key."
    );
    err.code = "INVALID_FIREBASE_SERVICE_ACCOUNT";
    throw err;
  }

  return {
    ...parsed,
    private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
  };
}

function parseServiceAccountFromEnvJson() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON value. Expected a JSON object.");
    err.code = "INVALID_FIREBASE_SERVICE_ACCOUNT";
    throw err;
  }

  return normalizeServiceAccount(parsed);
}

function parseServiceAccountFromFilePath() {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!filePath || !filePath.trim()) return null;

  const absolutePath = path.resolve(filePath);
  let raw;
  try {
    raw = fs.readFileSync(absolutePath, "utf8");
  } catch {
    const err = new Error(`Unable to read FIREBASE_SERVICE_ACCOUNT_PATH at: ${absolutePath}`);
    err.code = "INVALID_FIREBASE_SERVICE_ACCOUNT";
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error(`Invalid Firebase service account JSON in file: ${absolutePath}`);
    err.code = "INVALID_FIREBASE_SERVICE_ACCOUNT";
    throw err;
  }

  return normalizeServiceAccount(parsed);
}

function parseServiceAccount() {
  const fromJsonEnv = parseServiceAccountFromEnvJson();
  if (fromJsonEnv) return fromJsonEnv;

  const fromFilePath = parseServiceAccountFromFilePath();
  if (fromFilePath) return fromFilePath;

  const err = new Error(
    "Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH."
  );
  err.code = "MISSING_ENV";
  throw err;
}

function getFirebaseAdminApp() {
  if (!initialized) {
    if (admin.apps.length === 0) {
      const serviceAccount = parseServiceAccount();
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    initialized = true;
  }

  return admin.app();
}

function getFirebaseAuth() {
  return getFirebaseAdminApp().auth();
}

module.exports = {
  getFirebaseAuth,
};
