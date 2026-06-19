#!/usr/bin/env node
// Grant tokens to a user by email.
// Usage (run from the backend/ directory):
//   node scripts/grant-tokens.js <email> <amount>
require("../config/env");
const { getFirebaseAuth } = require("../services/firebaseAdmin");
const { addTokens } = require("../services/tokenService");

async function main() {
  const [email, amountRaw] = process.argv.slice(2);
  if (!email || !amountRaw) {
    console.error("Usage: node scripts/grant-tokens.js <email> <amount>");
    process.exit(1);
  }

  const amount = Number(amountRaw);
  if (!Number.isInteger(amount) || amount <= 0) {
    console.error(`Invalid amount: "${amountRaw}". Must be a positive integer.`);
    process.exit(1);
  }

  const user = await getFirebaseAuth().getUserByEmail(email);
  const newBalance = await addTokens(user.uid, amount);
  console.log(
    `Added ${amount} tokens to ${email} (uid ${user.uid}). New balance: ${newBalance}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
