#!/usr/bin/env node
// List a user's applications by UID.
// Usage (run from the backend/ directory):
//   node scripts/list-applications.js <uid>
require("../config/env");
const { getFirebaseAuth } = require("../services/firebaseAdmin");
const { listApplications } = require("../services/applicationService");

async function main() {
  const [uid] = process.argv.slice(2);
  if (!uid) {
    console.error("Usage: node scripts/list-applications.js <uid>");
    process.exit(1);
  }

  let email = "(unknown)";
  try {
    const user = await getFirebaseAuth().getUser(uid);
    email = user.email || "(no email)";
  } catch {
    email = "(no auth record)";
  }

  const apps = await listApplications(uid);

  console.log(`\nUser: ${email}  (uid ${uid})`);
  console.log(`Applications: ${apps.length}\n`);

  for (const a of apps) {
    const created = a.createdAt ? a.createdAt.slice(0, 10) : "----------";
    console.log(
      `${created}  ${String(a.status).padEnd(9)}  ${String(a.matchScore).padStart(3)}  ` +
        `${(a.company || "(no company)").padEnd(24)}  ${a.targetRole || "(no role)"}`
    );
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
