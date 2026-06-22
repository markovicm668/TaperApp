#!/usr/bin/env node
// Show the parsed resume from a user's most recent application.
// Direct contact identifiers (email/phone/url/address/profile links) are
// masked by default. Pass --contact to include them.
//   node scripts/show-resume.js <uid> [--contact]
require("../config/env");
const { getFirebaseFirestore } = require("../services/firebaseAdmin");

function fmtDate(d) {
  return d || "";
}

async function main() {
  const args = process.argv.slice(2);
  const showContact = args.includes("--contact");
  const uid = args.find((a) => !a.startsWith("--"));
  if (!uid) {
    console.error("Usage: node scripts/show-resume.js <uid> [--contact]");
    process.exit(1);
  }

  const snap = await getFirebaseFirestore()
    .collection("applications")
    .where("uid", "==", uid)
    .get();

  if (snap.empty) {
    console.log(`No applications found for uid ${uid}.`);
    return;
  }

  const docs = snap.docs.sort((a, b) => {
    const ta = a.data().createdAt?.toMillis?.() ?? 0;
    const tb = b.data().createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });

  const r = docs[0].data()?.parsed?.resumeData;
  if (!r) {
    console.log("Most recent application has no parsed resume data.");
    return;
  }

  const b = r.basics || {};
  const mask = (v) => (v ? (showContact ? v : "[masked]") : "");

  console.log("\n=== RESUME ===");
  console.log(`Name:     ${b.name || ""}`);
  console.log(`Title:    ${b.title || b.label || ""}`);
  console.log(`Email:    ${mask(b.email)}`);
  console.log(`Phone:    ${mask(b.phone)}`);
  console.log(`Website:  ${mask(b.url)}`);
  const loc = b.location || {};
  const city = [loc.city, loc.region, loc.countryCode].filter(Boolean).join(", ");
  console.log(`Location: ${city}${loc.address ? "  " + mask(loc.address) : ""}`);
  if (Array.isArray(b.profiles) && b.profiles.length) {
    console.log(`Profiles: ${b.profiles.map((p) => `${p.network || "?"}:${mask(p.url || p.username)}`).join("  ")}`);
  }

  if (r.summary) console.log(`\n--- Summary ---\n${r.summary}`);

  if (Array.isArray(r.work) && r.work.length) {
    console.log(`\n--- Experience ---`);
    for (const w of r.work) {
      console.log(`\n${w.position || ""} @ ${w.company || ""}  (${fmtDate(w.startDate)} - ${w.isCurrent ? "Present" : fmtDate(w.endDate)})`);
      for (const h of w.highlights || []) console.log(`  • ${h.text}`);
    }
  }

  if (Array.isArray(r.education) && r.education.length) {
    console.log(`\n--- Education ---`);
    for (const e of r.education) {
      console.log(`  ${e.degree || ""} ${e.area ? "in " + e.area : ""} — ${e.institution || ""} (${fmtDate(e.startDate)} - ${fmtDate(e.endDate)})`);
    }
  }

  if (Array.isArray(r.projects) && r.projects.length) {
    console.log(`\n--- Projects ---`);
    for (const p of r.projects) {
      console.log(`  ${p.name || ""}${p.role ? " — " + p.role : ""}`);
      for (const h of p.highlights || []) console.log(`    • ${h.text}`);
    }
  }

  if (Array.isArray(r.skills) && r.skills.length) {
    console.log(`\n--- Skills ---\n  ${r.skills.map((s) => s.name).filter(Boolean).join(", ")}`);
  }

  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
