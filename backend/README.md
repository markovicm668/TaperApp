# Resume Analyzer API (Express + Gemini)

Production-ready Node.js backend for an AI-powered Resume Analyzer SaaS. Accepts a resume (plain text) + a job description, calls Google Gemini (`gemini-1.5-flash`) to analyze/rewrite, and returns **strict structured JSON**.

## Requirements

- Node.js 18+
- A Google Gemini API key
- Firebase project with Authentication enabled
- Firebase service account credentials for backend token verification

## Setup (local)

```bash
cd backend
npm install
cp .env.example .env
```

Set these values in `.env`:

- `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (single-line JSON string for a Firebase service account key), or
- `FIREBASE_SERVICE_ACCOUNT_PATH` (absolute path to a Firebase service account JSON file)
- `CORS_ALLOWED_ORIGIN` (optional, defaults to `http://localhost:3000`)
- `ADMIN_EMAIL` (optional; required for `POST /user/me/add-credits` to work — must match the signed-in admin's Firebase account email)

Run locally:

```bash
npm run dev
```

Health check:

```bash
curl -s http://localhost:8080/healthz
```

## API

### POST `/analyze`

Requires header: `Authorization: Bearer <firebase_id_token>`

Request body (JSON):

```json
{
  "resumeText": "string",
  "jobDescription": "string"
}
```

Example:

```bash
curl -sS -X POST "http://localhost:8080/analyze" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -d '{
    "resumeText": "Software Engineer\\n- Built REST APIs in Node.js\\n- Improved CI pipelines",
    "jobDescription": "We need a Node.js engineer with REST API experience, CI/CD, and cloud deployment."
  }' | jq .
```

Successful response schema:

- `matchScore`: number (0–100)
- `overallFit`: `"Poor" | "Fair" | "Good" | "Great"`
- `missingKeywords`: `string[]`
- `matchedKeywords`: `string[]`
- `rewrittenBullets`: `{ original, improved, rationale }[]`
- `atsWarnings`: `string[]`
- `suggestions`: `string[]`
- `roleSeniority`: `"Junior" | "Mid" | "Senior"`

Errors:

- `400` validation errors (missing inputs)
- `401` missing or invalid Firebase auth token
- `502` Gemini failures or malformed AI output

### POST `/parse`

Parses resume text into sectioned, schema-validated JSON. This endpoint does not require a job description.
Requires header: `Authorization: Bearer <firebase_id_token>`

Request body (JSON):

```json
{
  "resumeText": "string",
  "inputType": "file | text | linkedin",
  "fileName": "optional-string"
}
```

Successful response:

```json
{
  "success": true,
  "data": {
    "version": "2",
    "source": {
      "inputType": "text",
      "rawText": "original resume text",
      "importedAt": "2026-02-07T00:00:00.000Z",
      "parsedAt": "2026-02-07T00:00:00.000Z",
      "parser": "gemini-section-parser-v2"
    },
    "resumeData": {
      "basics": {},
      "work": [],
      "education": [],
      "projects": [],
      "awards": [],
      "skills": {},
      "languages": []
    },
    "sections": [
      {
        "id": "section-1",
        "title": "Header",
        "kind": "header",
        "canonicalTarget": "none",
        "lines": ["Jane Doe"]
      }
    ],
    "sectionPresence": {
      "summary": false,
      "work": true,
      "projects": true,
      "skills": true,
      "education": true,
      "awards": false,
      "languages": true
    },
    "customSections": [],
    "notes": []
  }
}
```

Behavior:

- Primary parser uses Gemini with strict JSON output.
- Gemini is the only parse engine. If Gemini output is malformed or fails schema validation after retries, the request fails.
- Fallback usage is surfaced in `data.notes`.

Errors:

- `400 INVALID_INPUT`
- `401 AUTH_REQUIRED | AUTH_INVALID`
- `500 PARSE_FAILED` (when Gemini parsing fails)

## Environment variables

- `GEMINI_API_KEY` (required): Gemini API key
- `FIREBASE_SERVICE_ACCOUNT_JSON` (optional): Firebase service account JSON string used by `firebase-admin`
- `FIREBASE_SERVICE_ACCOUNT_PATH` (optional): absolute path to Firebase service account JSON file
  - At least one of `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH` is required.
- `CORS_ALLOWED_ORIGIN` (optional): comma-separated list of allowed frontend origins (default `http://localhost:3000`)
- `PORT` (optional): defaults to `8080` (Cloud Run standard)
- `ADMIN_EMAIL` (optional): email of the account allowed to call `POST /user/me/add-credits`; the route 403s for everyone if unset
- `LEMONSQUEEZY_API_KEY` (required for purchases): Lemon Squeezy API key used to create checkouts and fetch subscriptions
- `LEMONSQUEEZY_STORE_ID` (required for purchases): Lemon Squeezy store id
- `LEMONSQUEEZY_WEBHOOK_SECRET` (required for purchases): signing secret set on the Lemon Squeezy webhook
- `LEMONSQUEEZY_VARIANT_ID_WEEKLY` / `LEMONSQUEEZY_VARIANT_ID_MONTHLY` / `LEMONSQUEEZY_VARIANT_ID_LIFETIME` (required for purchases): variant ids of the three plan products
  - Test mode and live mode have different API keys, webhook secrets, and variant ids — configure per environment. Missing values don't break the rest of the API; only `/billing/*` and the webhook fail.

## Billing (Lemon Squeezy)

Three plans grant **unlimited usage** (analyses, saves, downloads) while active: a $4/week subscription, a $9/month subscription, and a $29 one-time lifetime purchase. Free users keep the credit system (5 starter tokens, referrals, one free anonymous trial).

Entitlement lives on `users/{uid}`: `plan` (`weekly|monthly|lifetime|null`) + `planExpiresAt` (null for lifetime). A user is entitled when `plan === 'lifetime'` or `planExpiresAt` is in the future. Subscriptions extend `planExpiresAt` only via webhooks (`renews_at` while live, `ends_at` for a cancelled-in-grace period), so access fails closed if webhooks stop. Subscription state is mirrored in `lemonSqueezySubscriptions/{subId}` (uid resolution + out-of-order guard on `updated_at`); lifetime orders are deduped once per order id in `lemonSqueezyOrders`.

- `POST /billing/checkout` (auth required, anonymous users 403): body `{ "planId": "weekly" | "monthly" | "lifetime" }`, returns `{ "url": "<overlay checkout url>" }`. The plan → variant mapping lives in `config/plans.js`.
- `GET /billing/portal` (auth required): returns a fresh Lemon Squeezy customer-portal URL for the user's subscription (404 `NO_SUBSCRIPTION` if they have none). Portal URLs are signed and expiring — fetched per click, never stored.
- `POST /webhooks/lemonsqueezy`: Lemon Squeezy delivery endpoint (HMAC-verified over the raw body — the route is mounted before the global JSON parser in `index.js`, keep it there). `subscription_*` events sync plan state; `order_created` on the lifetime variant activates lifetime access; `order_refunded` revokes a lifetime order (and still claws back legacy credit-pack orders).

Dashboard setup: create two **subscription** products ($4 billed weekly, $9 billed monthly — the billing interval lives on the Lemon Squeezy variant) and one **single-payment** $29 lifetime product; copy each variant id into the matching env var. Create an API key, and a webhook pointing at `https://<backend-host>/webhooks/lemonsqueezy` (the backend's public domain — on Railway, the generated `*.up.railway.app` domain or your custom domain) subscribed to: `order_created`, `order_refunded`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused`, `subscription_plan_changed`.

Test mode and live mode are fully separate in Lemon Squeezy (different API keys, variant ids, and webhook secrets). Configure the backend with the **test-mode** values while the store is unactivated; swap all six to the live values once the store is activated.

Deploy secrets on Railway — add them in the service's **Variables** tab (saving redeploys), or via the CLI:

```bash
railway variables \
  --set "LEMONSQUEEZY_API_KEY=..." \
  --set "LEMONSQUEEZY_STORE_ID=..." \
  --set "LEMONSQUEEZY_WEBHOOK_SECRET=..." \
  --set "LEMONSQUEEZY_VARIANT_ID_WEEKLY=..." \
  --set "LEMONSQUEEZY_VARIANT_ID_MONTHLY=..." \
  --set "LEMONSQUEEZY_VARIANT_ID_LIFETIME=..."
```

If you deployed the earlier credit-pack version, delete the now-unused `LEMONSQUEEZY_VARIANT_ID_SMALL`, `LEMONSQUEEZY_VARIANT_ID_MEDIUM`, and `LEMONSQUEEZY_VARIANT_ID_LARGE` variables from the same tab.

## Docker (Cloud Run ready)

Build and run locally:

```bash
cd backend
docker build -t resume-analyzer-api .
docker run --rm -p 8080:8080 -e GEMINI_API_KEY="YOUR_KEY" resume-analyzer-api
```

## Deploy to Google Cloud Run

Prereqs:

- `gcloud` installed and authenticated
- A GCP project and billing enabled

Set variables:

```bash
PROJECT_ID="YOUR_PROJECT_ID"
REGION="us-central1"
SERVICE_NAME="resume-analyzer-api"
```

Enable APIs:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com --project "$PROJECT_ID"
```

Build & deploy from source (Cloud Build):

```bash
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="YOUR_KEY"
```

Then call the service:

```bash
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
curl -sS -X POST "$SERVICE_URL/analyze" -H "Content-Type: application/json" -d '{"resumeText":"...","jobDescription":"..."}'
```
