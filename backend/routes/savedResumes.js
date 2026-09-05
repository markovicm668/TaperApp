const express = require("express");
const savedResumeService = require("../services/savedResumeService");
const { validateParsedPayload } = require("../services/aiContracts");
const { isAnonymousRequest } = require("../utils/authClaims");

function createSavedResumesRouter({
  service = savedResumeService,
  validateParsed = validateParsedPayload,
} = {}) {
  const router = express.Router();

  // All routes assume requireAuth ran upstream (mounted in index.js),
  // so req.auth.uid is always present here.

  router.get("/", async (req, res) => {
    try {
      const savedResumes = await service.listSavedResumes(req.auth.uid);
      return res.status(200).json({ savedResumes });
    } catch (err) {
      console.error("-> List saved resumes error:", err);
      return res.status(500).json({
        error: { code: "SAVED_RESUMES_LIST_FAILED", message: "Failed to list saved resumes." },
      });
    }
  });

  // Stores a resume the user opted to keep for future analyses. The payload is
  // whatever the parse step already produced, so saving costs no extra AI call
  // and is free — /analyze remains the only billable moment.
  router.post("/", async (req, res) => {
    try {
      const { label, parsed } = req.body || {};

      if (isAnonymousRequest(req)) {
        return res.status(403).json({
          error: { code: "ANONYMOUS_FORBIDDEN", message: "Sign in to save a resume." },
        });
      }

      if (!parsed || typeof parsed !== "object") {
        return res.status(400).json({
          error: { code: "INVALID_INPUT", message: "parsed is required." },
        });
      }

      // Reuse the shared contract rather than trusting the shape, since this
      // payload is replayed straight into /analyze on every later reuse.
      const validation = validateParsed(parsed);
      if (!validation.success) {
        return res.status(400).json({
          error: { code: "INVALID_INPUT", message: "parsed failed contract validation." },
        });
      }

      let created;
      try {
        created = await service.createSavedResume(req.auth.uid, { label, parsed });
      } catch (err) {
        if (err.code === "SAVED_RESUME_LIMIT") {
          return res.status(409).json({
            error: { code: "SAVED_RESUME_LIMIT", message: err.message },
          });
        }
        throw err;
      }

      return res.status(201).json({ savedResume: created });
    } catch (err) {
      console.error("-> Create saved resume error:", err);
      return res.status(500).json({
        error: { code: "SAVED_RESUME_CREATE_FAILED", message: "Failed to save resume." },
      });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const savedResume = await service.getSavedResume(req.auth.uid, req.params.id);
      if (!savedResume) {
        return res.status(404).json({
          error: { code: "SAVED_RESUME_NOT_FOUND", message: "Saved resume not found." },
        });
      }
      return res.status(200).json({ savedResume });
    } catch (err) {
      console.error("-> Get saved resume error:", err);
      return res.status(500).json({
        error: { code: "SAVED_RESUME_GET_FAILED", message: "Failed to load saved resume." },
      });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const { label } = req.body || {};

      const savedResume = await service.renameSavedResume(req.auth.uid, req.params.id, label);
      if (!savedResume) {
        return res.status(404).json({
          error: { code: "SAVED_RESUME_NOT_FOUND", message: "Saved resume not found." },
        });
      }
      return res.status(200).json({ savedResume });
    } catch (err) {
      if (err.code === "INVALID_LABEL") {
        return res.status(400).json({
          error: { code: "INVALID_LABEL", message: err.message },
        });
      }
      console.error("-> Rename saved resume error:", err);
      return res.status(500).json({
        error: { code: "SAVED_RESUME_UPDATE_FAILED", message: "Failed to rename saved resume." },
      });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const deleted = await service.deleteSavedResume(req.auth.uid, req.params.id);
      if (!deleted) {
        return res.status(404).json({
          error: { code: "SAVED_RESUME_NOT_FOUND", message: "Saved resume not found." },
        });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("-> Delete saved resume error:", err);
      return res.status(500).json({
        error: { code: "SAVED_RESUME_DELETE_FAILED", message: "Failed to delete saved resume." },
      });
    }
  });

  return router;
}

module.exports = createSavedResumesRouter();
module.exports.createSavedResumesRouter = createSavedResumesRouter;
