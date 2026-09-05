// Admin tool: grant a user free lifetime access by email (comps, support
// make-goods, friends & family).
//
//   node scripts/grant-plan.js <email>                     # read-only: show current state
//   node scripts/grant-plan.js <email> --confirm           # grant lifetime access
//   node scripts/grant-plan.js <email> --confirm --order-id=comp_2026_conf
//   node scripts/grant-plan.js <email> --confirm --note="won the launch raffle"
//
// Run from the backend/ directory (config/env reads ./.env).
//
// This goes through the same activateLifetimeOnce() the Polar webhook uses, so
// the user doc ends up identical to a paid lifetime purchase and an audit row
// is written to polarOrders. No money moves and Polar never sees it.
//
// The grant is deduped by order id, which defaults to comp_<uid>. That makes a
// double-run a no-op — but it also means re-granting after a revoke needs a
// fresh --order-id (the script tells you when you hit that case).
require("../config/env");
const { getFirebaseAuth, getFirebaseFirestore } = require("../services/firebaseAdmin");
const { computeEntitlement } = require("../services/entitlementService");
const { activateLifetimeOnce, ORDERS_COLLECTION } = require("../services/purchaseService");

const email = process.argv[2];
const confirm = process.argv.includes("--confirm");
const flag = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

if (!email || email.startsWith("--")) {
  console.error("Usage: node scripts/grant-plan.js <email> [--confirm] [--order-id=<id>] [--note=<text>]");
  process.exit(1);
}

function planFields(data = {}) {
  return {
    plan: data.plan ?? null,
    planExpiresAt: data.planExpiresAt
      ? new Date(
          typeof data.planExpiresAt.toMillis === "function"
            ? data.planExpiresAt.toMillis()
            : data.planExpiresAt
        ).toISOString()
      : null,
    subscriptionId: data.subscriptionId ?? null,
    subscriptionStatus: data.subscriptionStatus ?? null,
    lifetimeOrderId: data.lifetimeOrderId ?? null,
    polarCustomerId: data.polarCustomerId ?? null,
    entitled: computeEntitlement(data).entitled,
  };
}

async function main() {
  let user;
  try {
    user = await getFirebaseAuth().getUserByEmail(email);
  } catch (err) {
    console.error(`No Firebase account for ${email} (${err.code || err.message}).`);
    console.error("They must sign in to the app at least once before you can grant a plan.");
    process.exit(1);
  }

  const db = getFirebaseFirestore();
  const ref = db.collection("users").doc(user.uid);
  const before = (await ref.get()).data() ?? {};
  const orderId = flag("order-id") || `comp_${user.uid}`;

  console.log(`\n${email}  (uid ${user.uid})`);
  console.log("BEFORE:", JSON.stringify(planFields(before), null, 2));
  console.log(`\nGrant order id: ${orderId}`);

  if (!confirm) {
    console.log("\nRead-only. Re-run with --confirm to grant lifetime access.\n");
    return;
  }

  const result = await activateLifetimeOnce({
    uid: user.uid,
    orderId,
    meta: {
      comp: true,
      grantedBy: "scripts/grant-plan.js",
      grantedTo: email,
      ...(flag("note") ? { note: flag("note") } : {}),
    },
  });

  if (!result.activated) {
    // The only reason activateLifetimeOnce declines is a pre-existing order doc.
    const stillEntitled = computeEntitlement(before).entitled;
    console.log(`\nNo-op: order "${orderId}" was already processed (${result.reason}).`);
    console.log(
      stillEntitled
        ? "This user already has the grant — nothing to do.\n"
        : `Their plan was cleared after that grant. To re-grant, pass a fresh id:\n` +
          `  node scripts/grant-plan.js ${email} --confirm --order-id=${orderId}_2\n`
    );
    return;
  }

  const after = (await ref.get()).data() ?? {};
  console.log("AFTER: ", JSON.stringify(planFields(after), null, 2));
  console.log(
    `\nLifetime access granted (audit row: ${ORDERS_COLLECTION}/${orderId}).` +
      `\nTo undo: node scripts/revoke-plan.js ${email} --confirm\n`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
