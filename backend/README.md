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
- `POLAR_SERVER` (required for purchases): `sandbox` or `production` — selects the Polar API base URL
- `POLAR_ACCESS_TOKEN` (required for purchases): Polar Organization Access Token used to create checkouts and customer sessions
- `POLAR_WEBHOOK_SECRET` (required for purchases): signing secret set on the Polar webhook endpoint
- `POLAR_PRODUCT_ID_WEEKLY` / `POLAR_PRODUCT_ID_MONTHLY` / `POLAR_PRODUCT_ID_LIFETIME` (required for purchases): the three Polar product ids
- `APP_ORIGIN` (optional): frontend origin for the checkout overlay's `embed_origin` and the success redirect; falls back to `CORS_ALLOWED_ORIGIN`
  - Sandbox and production are separate Polar environments with different tokens, product ids, and webhook secrets — configure per environment. Missing values don't break the rest of the API; only `/billing/*` and the webhook fail.

## Billing (Polar)

Three plans grant **unlimited usage** (analyses, saves, downloads) while active: a $4/week subscription, a $9/month subscription, and a $29 one-time lifetime purchase. Free users keep the credit system (5 starter tokens, referrals, one free anonymous trial).

Entitlement lives on `users/{uid}`: `plan` (`weekly|monthly|lifetime|null`) + `planExpiresAt` (null for lifetime). A user is entitled when `plan === 'lifetime'` or `planExpiresAt` is in the future. Subscriptions extend `planExpiresAt` only via webhooks (`current_period_end` while live, `ends_at` for a cancelled-in-grace period), so access fails closed if webhooks stop. Subscription state is mirrored in `polarSubscriptions/{subId}` (uid resolution + out-of-order guard on `modified_at`); lifetime orders are deduped once per order id in `polarOrders`.

- `POST /billing/checkout` (auth required, anonymous users 403): body `{ "planId": "weekly" | "monthly" | "lifetime" }`, returns `{ "url": "<overlay checkout url>" }`. The plan → product mapping lives in `config/plans.js`. The checkout carries `external_customer_id` and `metadata.user_id` = the Firebase uid.
- `GET /billing/portal` (auth required): returns a fresh Polar customer-portal URL for the user's saved `polarCustomerId` (404 `NO_SUBSCRIPTION` if none). Portal URLs are short-lived — fetched per click, never stored.
- `POST /webhooks/polar`: Polar delivery endpoint, verified with the Standard Webhooks spec over the raw body (the route is mounted before the global JSON parser in `index.js`, keep it there). `subscription.*` events sync plan state; `order.created` on the lifetime product activates lifetime access; `order.created` with `billing_reason: subscription_cycle` advances a renewal; `order.refunded`/`refund.created` revoke a lifetime order.

Dashboard setup (do this in the **sandbox** org first, then repeat in production): create two **subscription** products ($4 recurring weekly, $9 recurring monthly) and one **one-time** $29 lifetime product; copy each product id into the matching env var. Create an Organization Access Token, and a webhook pointing at `https://<backend-host>/webhooks/polar` (on Railway, the generated `*.up.railway.app` domain or your custom domain) subscribed to: `subscription.created`, `subscription.updated`, `subscription.active`, `subscription.canceled`, `subscription.revoked`, `order.created`, `order.refunded` (and `refund.created` if available).

Sandbox (`sandbox-api.polar.sh`) and production (`api.polar.sh`) are fully isolated. Build and verify against sandbox with `POLAR_SERVER=sandbox` and sandbox credentials, then flip `POLAR_SERVER=production` and swap the token/product ids/webhook secret to the production values. **Renewals are `order.created` events (`billing_reason: subscription_cycle`), not subscription events** — the webhook handles both.

Deploy secrets on Railway — add them in the service's **Variables** tab (saving redeploys), or via the CLI:

```bash
railway variables \
  --set "POLAR_SERVER=sandbox" \
  --set "POLAR_ACCESS_TOKEN=..." \
  --set "POLAR_WEBHOOK_SECRET=..." \
  --set "POLAR_PRODUCT_ID_WEEKLY=..." \
  --set "POLAR_PRODUCT_ID_MONTHLY=..." \
  --set "POLAR_PRODUCT_ID_LIFETIME=..."
```

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
