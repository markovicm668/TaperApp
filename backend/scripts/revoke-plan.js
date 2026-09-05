// Admin tool: revoke a user's plan/entitlement by email.
//
//   node scripts/revoke-plan.js <email>            # read-only: show current state
//   node scripts/revoke-plan.js <email> --confirm  # clear the plan fields
//
// This only clears entitlement in Firestore. If the user has a LIVE Polar
// subscription, also cancel/refund it in the Polar dashboard, or the next
// renewal webhook will re-grant access.
require("../config/env");
const { FieldValue } = require("firebase-admin/firestore");
const { getFirebaseAuth, getFirebaseFirestore } = require("../services/firebaseAdmin");
const { computeEntitlement } = require("../services/entitlementService");

const email = process.argv[2];
const confirm = process.argv.includes("--confirm");

if (!email) {
  console.error("Usage: node scripts/revoke-plan.js <email> [--confirm]");
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
    process.exit(1);
  }

  const ref = getFirebaseFirestore().collection("users").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`No users/${user.uid} doc for ${email}; nothing to revoke.`);
    process.exit(1);
  }

  console.log(`\n${email}  (uid ${user.uid})`);
  console.log("BEFORE:", JSON.stringify(planFields(snap.data()), null, 2));

  if (!confirm) {
    console.log("\nRead-only. Re-run with --confirm to clear the plan.\n");
    return;
  }

  await ref.set(
    {
      plan: null,
      planExpiresAt: null,
      lifetimeOrderId: null,
      planUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const after = await ref.get();
  console.log("AFTER: ", JSON.stringify(planFields(after.data()), null, 2));
  console.log("\nPlan revoked. If they had a live Polar subscription, also cancel/refund it in the Polar dashboard.\n");
}

main().then(() => process.exit(0));
