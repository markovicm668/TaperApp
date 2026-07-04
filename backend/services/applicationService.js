const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");

const APPLICATIONS_COLLECTION = "applications";

// Status pipeline adapted from career-ops templates/states.yml
// (https://github.com/santifer/career-ops), MIT License,
// Copyright (c) 2026 Santiago Fernandez de Valderrama.
const APPLICATION_STATUSES = ["saved", "applied", "interview", "offer", "rejected"];

function getCollection() {
  return getFirebaseFirestore().collection(APPLICATIONS_COLLECTION);
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

function toSummary(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    company: data.company || "",
    targetRole: data.targetRole || "",
    matchScore: data.matchScore ?? 0,
    scores: data.scores || null,
    status: data.status || "saved",
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function toDetail(doc) {
  const data = doc.data();
  return {
    ...toSummary(doc),
    jobDescription: data.jobDescription || "",
    analysis: data.analysis || null,
    parsed: data.parsed || null,
    editedBulletChanges: data.editedBulletChanges || null,
    lastEditedAt: timestampToIso(data.lastEditedAt),
  };
}

async function createApplication(uid, { company, targetRole, jobDescription, matchScore, scores, analysis, parsed }) {
  if (!uid) throw new Error("uid is required to create an application.");

  const docRef = await getCollection().add({
    uid,
    company: company || "",
    targetRole: targetRole || "",
    jobDescription: jobDescription || "",
    matchScore: Number.isFinite(matchScore) ? matchScore : 0,
    scores: stripUndefined(scores),
    analysis: stripUndefined(analysis),
    parsed: stripUndefined(parsed),
    status: "saved",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docRef.id };
}

async function listApplications(uid) {
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

async function getApplication(uid, id) {
  const doc = await getOwnedDoc(uid, id);
  return doc ? toDetail(doc) : null;
}

async function updateStatus(uid, id, status) {
  if (!APPLICATION_STATUSES.includes(status)) {
    const err = new Error(`Invalid status. Expected one of: ${APPLICATION_STATUSES.join(", ")}.`);
    err.code = "INVALID_STATUS";
    throw err;
  }

  const doc = await getOwnedDoc(uid, id);
  if (!doc) return null;

  await doc.ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  const updated = await doc.ref.get();
  return toSummary(updated);
}

// Persists the user's edited resume back onto the tracked application so
// reopening it from the tracker shows the edits. `bulletChanges` is the
// workspace's accept/reject state, saved so rehydration can restore the
// diff view without re-applying AI changes over the edited resumeData.
async function updateParsed(uid, id, { parsed, bulletChanges }) {
  const doc = await getOwnedDoc(uid, id);
  if (!doc) return null;

  await doc.ref.update({
    parsed: stripUndefined(parsed),
    editedBulletChanges: stripUndefined(Array.isArray(bulletChanges) ? bulletChanges : []),
    lastEditedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const updated = await doc.ref.get();
  return toSummary(updated);
}

async function deleteApplication(uid, id) {
  const doc = await getOwnedDoc(uid, id);
  if (!doc) return null;

  await doc.ref.delete();
  return { id };
}

module.exports = {
  APPLICATION_STATUSES,
  createApplication,
  listApplications,
  getApplication,
  updateStatus,
  updateParsed,
  deleteApplication,
};
