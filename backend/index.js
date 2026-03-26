const express = require("express");
const cors = require("cors");

// Load env early
require("./config/env");

const analyzeRoute = require("./routes/analyze");
const parseRoute = require("./routes/parse");
const parsePdfRoute = require("./routes/parsePdf");
const exportRoute = require("./routes/export");
const userRoute = require("./routes/user");
const requireAuth = require("./middleware/requireAuth");
const requireTokens = require("./middleware/requireTokens");

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
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (req, res) => res.status(200).json({ ok: true }));
app.use("/user/me", requireAuth, userRoute);
app.use("/analyze", requireAuth, requireTokens(3), analyzeRoute);
app.use("/parse", requireAuth, requireTokens(1), parseRoute);
app.use("/parse-pdf", requireAuth, requireTokens(1), parsePdfRoute);
app.use("/export", requireAuth, exportRoute);

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
