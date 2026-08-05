const express = require("express");
const cors = require("cors");

// Load env early
require("./config/env");

const analyzeRoute = require("./routes/analyze");
const parseRoute = require("./routes/parse");
const parsePdfRoute = require("./routes/parsePdf");
const exportRoute = require("./routes/export");
const userRoute = require("./routes/user");
const applicationsRoute = require("./routes/applications");
const requireAuth = require("./middleware/requireAuth");
const chargeAnalysis = require("./middleware/chargeAnalysis");
const requireAnalyzeEligibility = require("./middleware/requireAnalyzeEligibility");

const app = express();

// Minimal request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

const corsAllowedOrigin = process.env.CORS_ALLOWED_ORIGIN || "http://localhost:3000";
const corsOrigins = corsAllowedOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (req, res) => res.status(200).json({ ok: true }));
app.use("/user/me", requireAuth, userRoute);
// All three AI endpoints require a valid Firebase token (anonymous or real) so
// a token-less request is rejected outright — this closes the "drop the header
// for unlimited free analyses" exploit. chargeAnalysis is the only place a
// token is deducted (real user) or a free trial consumed (anonymous user);
// requireAnalyzeEligibility is a read-only gate so a Gemini parse is never
// burned on a request that could only 402 at /analyze anyway.
app.use("/analyze", requireAuth, chargeAnalysis(1), analyzeRoute);
app.use("/parse", requireAuth, requireAnalyzeEligibility(1), parseRoute);
app.use("/parse-pdf", requireAuth, requireAnalyzeEligibility(1), parsePdfRoute);
// /export/preview is anonymous-friendly; /export/pdf has its own requireAuth
// applied inside the router so the gate fires only for the paid action.
app.use("/export", exportRoute);
app.use("/applications", requireAuth, applicationsRoute);

// 404
app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found." },
  });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error." },
  });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
});
