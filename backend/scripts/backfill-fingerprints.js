#!/usr/bin/env node
// Seeds the résumé-fingerprint ledger from historical applications, so the
// free-grant allowance is enforced from day one instead of handing every
// existing account-cycler a fresh window.
//
// Also stamps `grantSpent` on existing user docs. There is no way to
// reconstruct how much of anyone's historical spend was grant-funded, so they
// are marked grant-exhausted: lenient by design — new accounts are what the
// ledger is for.
//
// Usage (run from the backend/ directory):
//   node scripts/backfill-fingerprints.js                          # dry run
//   node scripts/backfill-fingerprints.js --exclude a@b.com,c@d.com
//   node scripts/backfill-fingerprints.js --exclude a@b.com --commit
//
// Always pass --exclude with your own test accounts. Any résumé you ran through
// a dev account would otherwise be seeded as consumed, pre-blocking that
// person's real signup.
//
// Idempotent: `usedAt` is written as the union of what the applications imply
// and whatever the doc already holds, so re-running is safe and a run cannot
// clobber entries live traffic added in the meantime.
require("../config/env");
const { getFirebaseFirestore, getFirebaseAuth } = require("../services/firebaseAdmin");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { computeFingerprints, basicsFromParsed } = require("../utils/resumeFingerprint");
const {
  FINGERPRINTS_COLLECTION,
  FREE_GRANT_ANALYSES_PER_FINGERPRINT,
  FINGERPRINT_WINDOW_MS,
} = require("../services/resumeFingerprintService");
const { readUsedAtMillis, toTimestampArray } = require("../utils/rollingWindow");
const { INITIAL_TOKENS, USERS_COLLECTION } = require("../services/tokenService");

const BATCH_LIMIT = 450; // Firestore caps a batch at 500 writes.

function parseArgs(argv) {
  const commit = argv.includes("--commit");

  // Analyses run from your own test accounts must not seed the ledger: running
  // a friend's or a stranger's résumé through a dev account would otherwise
  // pre-block that person's real signup. Accepts emails or uids.
  //   --exclude you@example.com,test@example.com
  const flag = argv.find((a) => a.startsWith("--exclude="));
  const positional = argv[argv.indexOf("--exclude") + 1];
  const raw = flag ? flag.slice("--exclude=".length) : argv.includes("--exclude") ? positional : "";
  const exclude = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return { commit, exclude };
}

// Resolves the --exclude list (emails and/or uids) to a uid set.
async function resolveExcludedUids(auth, exclude) {
  const uids = new Set();
  for (const entry of exclude) {
    if (entry.includes("@")) {
      try {
        uids.add((await auth.getUserByEmail(entry)).uid);
      } catch {
        console.warn(`  --exclude: no account for ${entry}, ignoring`);
      }
    } else {
      uids.add(entry);
    }
  }
  return uids;
}

// Backfilling with a different salt than production uses would silently build a
// ledger that never matches a live request — worse than not backfilling at all.
function assertSaltPresent(commit) {
  const salt = process.env.FINGERPRINT_HASH_SALT;
  if (salt && salt.trim()) return;
  const message =
    "FINGERPRINT_HASH_SALT is not set. Backfilling without the production salt " +
    "produces hashes that will never match live traffic.";
  if (commit) {
    console.error(`\nRefusing to --commit: ${message}\n`);
    process.exit(1);
  }
  console.warn(`\nWARNING: ${message}\n`);
}

async function collectFromApplications(db, nowMillis, excludedUids = new Set()) {
  const snapshot = await db.collection("applications").get();

  // hash -> { kind, millis: Set<number>, uids: Set<string> }
  const groups = new Map();
  let withBasics = 0;
  let withoutBasics = 0;
  let excluded = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.uid && excludedUids.has(data.uid)) {
      excluded += 1;
      return;
    }
    const basics = basicsFromParsed(data.parsed);
    const fingerprints = computeFingerprints(basics);
    if (fingerprints.length === 0) {
      withoutBasics += 1;
      return;
    }
    withBasics += 1;

    const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : null;
    // Undated docs are counted as "now" so they still occupy a slot rather than
    // vanishing; there are few, and treating them as recent is the safe side.
    const millis = createdAt ?? nowMillis;

    for (const fp of fingerprints) {
      if (!groups.has(fp.hash)) {
        groups.set(fp.hash, { kind: fp.kind, millis: new Set(), uids: new Set() });
      }
      const group = groups.get(fp.hash);
      group.millis.add(millis);
      if (data.uid) group.uids.add(data.uid);
    }
  });

  return { groups, total: snapshot.size, withBasics, withoutBasics, excluded };
}

async function writeLedger(db, groups, nowMillis, commit) {
  const cutoff = nowMillis - FINGERPRINT_WINDOW_MS;
  let written = 0;
  let overCap = 0;
  let batch = db.batch();
  let pending = 0;

  for (const [hash, group] of groups) {
    const ref = db.collection(FINGERPRINTS_COLLECTION).doc(hash);
    const snap = await ref.get();

    // Union with whatever is already stored so a re-run never drops entries
    // that live traffic wrote after an earlier run.
    const merged = new Set(readUsedAtMillis(snap));
    for (const ms of group.millis) merged.add(ms);

    // Only in-window entries matter to the limiter; older ones would prune on
    // the next read anyway and only bloat the doc.
    const inWindow = [...merged].filter((ms) => ms > cutoff).sort((a, b) => a - b);
    if (inWindow.length >= FREE_GRANT_ANALYSES_PER_FINGERPRINT) overCap += 1;

    if (commit) {
      batch.set(
        ref,
        {
          kind: group.kind,
          usedAt: toTimestampArray(inWindow),
          backfilledAt: FieldValue.serverTimestamp(),
          backfilledCount: group.millis.size,
          updatedAt: FieldValue.serverTimestamp(),
          ...(snap.exists ? {} : { createdAt: Timestamp.fromMillis(Math.min(...inWindow, nowMillis)) }),
        },
        { merge: true }
      );
      pending += 1;
      if (pending >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    written += 1;
  }

  if (commit && pending > 0) await batch.commit();
  return { written, overCap };
}

async function stampGrantSpent(db, commit) {
  const snapshot = await db.collection(USERS_COLLECTION).get();
  let needed = 0;
  let batch = db.batch();
  let pending = 0;

  for (const doc of snapshot.docs) {
    if (Number.isFinite(doc.data().grantSpent)) continue;
    needed += 1;
    if (!commit) continue;

    batch.update(doc.ref, { grantSpent: INITIAL_TOKENS });
    pending += 1;
    if (pending >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (commit && pending > 0) await batch.commit();
  return { total: snapshot.size, needed };
}

async function main() {
  const { commit, exclude } = parseArgs(process.argv.slice(2));
  assertSaltPresent(commit);

  const db = getFirebaseFirestore();
  const auth = getFirebaseAuth();
  const nowMillis = Date.now();

  console.log(commit ? "Mode: COMMIT (writing)" : "Mode: DRY RUN (no writes)");

  const excludedUids = await resolveExcludedUids(auth, exclude);
  if (excludedUids.size > 0) {
    console.log(`Excluding ${excludedUids.size} test account(s) from the ledger.`);
  } else {
    console.warn(
      "No --exclude given: analyses run from your own test accounts WILL seed the\n" +
        "ledger, which can pre-block the real signup of anyone whose résumé you tested."
    );
  }

  const { groups, total, withBasics, withoutBasics, excluded } = await collectFromApplications(
    db,
    nowMillis,
    excludedUids
  );
  console.log(`\nApplications scanned:      ${total}`);
  console.log(`  from excluded accounts:  ${excluded}`);
  console.log(`  with a usable contact:   ${withBasics}`);
  console.log(`  without (skipped):       ${withoutBasics}`);
  console.log(`Distinct fingerprint keys: ${groups.size}`);

  // Rank by in-window consumption so anything already over cap is obvious —
  // an unexpected name here means false positives waiting to happen.
  const cutoff = nowMillis - FINGERPRINT_WINDOW_MS;
  const ranked = [...groups.entries()]
    .map(([hash, group]) => ({
      hash,
      kind: group.kind,
      inWindow: [...group.millis].filter((ms) => ms > cutoff).length,
      uids: group.uids.size,
    }))
    .sort((a, b) => b.inWindow - a.inWindow)
    .slice(0, 10);

  console.log(`\nTop keys by in-window usage (cap ${FREE_GRANT_ANALYSES_PER_FINGERPRINT}):`);
  for (const row of ranked) {
    const flag = row.inWindow >= FREE_GRANT_ANALYSES_PER_FINGERPRINT ? "  <-- OVER CAP" : "";
    console.log(
      `  ${row.hash.slice(0, 12)}…  ${row.kind.padEnd(9)} ` +
        `uses=${String(row.inWindow).padStart(3)}  accounts=${String(row.uids).padStart(2)}${flag}`
    );
  }

  const { written, overCap } = await writeLedger(db, groups, nowMillis, commit);
  console.log(`\nLedger docs ${commit ? "written" : "that would be written"}: ${written}`);
  console.log(`  already at or over cap: ${overCap}`);

  const users = await stampGrantSpent(db, commit);
  console.log(`\nUser docs: ${users.total}`);
  console.log(
    `  ${commit ? "stamped" : "needing"} grantSpent=${INITIAL_TOKENS}: ${users.needed}`
  );

  if (!commit) console.log("\nDry run only — re-run with --commit to apply.\n");
  else console.log("\nDone.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
