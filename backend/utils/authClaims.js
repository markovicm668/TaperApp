// Distinguishes an anonymous Firebase user (anonymous-auth) from a real,
// signed-in account. `req.auth` is the full decoded Firebase ID token; its
// `firebase.sign_in_provider` claim equals "anonymous" for anonymous users and
// the actual provider (e.g. "google.com", "password") for real accounts.
function isAnonymousRequest(req) {
  return req.auth?.firebase?.sign_in_provider === "anonymous";
}

module.exports = { isAnonymousRequest };
