const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");

const SAVED_RESUMES_COLLECTION = "savedResumes";

// Keeping a small cap bounds both the picker UI and the per-user Firestore
// footprint (each doc carries a full parsed payload, which is not small).
const MAX_SAVED_RESUMES = 5;
const MAX_LABEL_LENGTH = 80;

function getCollection() {
  return getFirebaseFirestore().collection(SAVED_RESUMES_COLLECTION);
}

// Firestore rejects `undefined` values; AI payloads routinely contain them.
function stripUndefined(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function timestampToIso(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === "function") return timestamp.toDate().toISOString();
  return null;
}

function countWords(text) {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function normalizeLabel(label) {
  if (typeof label !== "string") return "";
  return label.trim().slice(0, MAX_LABEL_LENGTH);
}

// The summary deliberately omits `parsed` and `rawText`: the list endpoint feeds
// a picker, and shipping every stored payload would make it enormous.
function toSummary(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    label: data.label || "",
    fileName: data.fileName || null,
    inputType: data.inputType || "text",
    wordCount: data.wordCount ?? 0,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function toDetail(doc) {
  const data = doc.data();
  return {
    ...toSummary(doc),
    rawText: data.rawText || "",
    parsed: data.parsed || null,
  };
}

// Everything the record needs is derived from the payload the parser produced,
// never from the client: on the PDF path the browser never sees the extracted
// text (it posts a File and gets structured JSON back), so `source.rawText` is
// the only complete copy of the resume.
function deriveFromParsed(parsed) {
  const source = (parsed && parsed.source) || {};
  const rawText = typeof source.rawText === "string" ? source.rawText : "";
  return {
    rawText,
    wordCount: countWords(rawText),
    fileName: typeof source.fileName === "string" && source.fileName ? source.fileName : null,
    inputType: typeof source.inputType === "string" && source.inputType ? source.inputType : "text",
  };
}

function defaultLabel(parsed, derived, existingCount) {
  if (derived.fileName) return normalizeLabel(derived.fileName);
  const name = parsed && parsed.resumeData && parsed.resumeData.basics && parsed.resumeData.basics.name;
  if (typeof name === "string" && name.trim()) return normalizeLabel(`${name.trim()} resume`);
  return `Resume ${existingCount + 1}`;
}

async function createSavedResume(uid, { label, parsed } = {}) {
  if (!uid) throw new Error("uid is required to create a saved resume.");

  const existing = await getCollection().where("uid", "==", uid).get();
  if (existing.size >= MAX_SAVED_RESUMES) {
    const err = new Error(
      `You can save up to ${MAX_SAVED_RESUMES} resumes. Delete one to save another.`
    );
    err.code = "SAVED_RESUME_LIMIT";
    throw err;
  }

  const derived = deriveFromParsed(parsed);
  const resolvedLabel = normalizeLabel(label) || defaultLabel(parsed, derived, existing.size);

  const docRef = await getCollection().add({
    uid,
    label: resolvedLabel,
    fileName: derived.fileName,
    inputType: derived.inputType,
    rawText: derived.rawText,
    wordCount: derived.wordCount,
    parsed: stripUndefined(parsed),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docRef.id, label: resolvedLabel };
}

async function listSavedResumes(uid) {
  const snapshot = await getCollection().where("uid", "==", uid).get();

  // Sorted in memory to avoid requiring a composite Firestore index.
  return snapshot.docs
    .map(toSummary)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function getOwnedDoc(uid, id) {
  const doc = await getCollection().doc(id).get();
  if (!doc.exists || doc.data().uid !== uid) return null;
  return doc;
}

async function getSavedResume(uid, id) {
  const doc = await getOwnedDoc(uid, id);
  return doc ? toDetail(doc) : null;
}

async function renameSavedResume(uid, id, label) {
  const normalized = normalizeLabel(label);
  if (!normalized) {
    const err = new Error("A label is required.");
    err.code = "INVALID_LABEL";
    throw err;
  }

  const doc = await getOwnedDoc(uid, id);
  if (!doc) return null;

  await doc.ref.update({ label: normalized, updatedAt: FieldValue.serverTimestamp() });
  const updated = await doc.ref.get();
  return toSummary(updated);
}

async function deleteSavedResume(uid, id) {
  const doc = await getOwnedDoc(uid, id);
  if (!doc) return null;

  await doc.ref.delete();
  return { id };
}

module.exports = {
  MAX_SAVED_RESUMES,
  createSavedResume,
  listSavedResumes,
  getSavedResume,
  renameSavedResume,
  deleteSavedResume,
};
