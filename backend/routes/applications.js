const express = require("express");
const applicationService = require("../services/applicationService");

function createApplicationsRouter({ service = applicationService } = {}) {
  const router = express.Router();

  // All routes assume requireAuth ran upstream (mounted in index.js),
  // so req.auth.uid is always present here.

  router.get("/", async (req, res) => {
    try {
      const applications = await service.listApplications(req.auth.uid);
      return res.status(200).json({ applications });
    } catch (err) {
      console.error("-> List applications error:", err);
      return res.status(500).json({
        error: { code: "APPLICATIONS_LIST_FAILED", message: "Failed to list applications." },
      });
    }
  });

  // Persist a pre-computed analysis as a tracked application. Used to save the
  // work an anonymous user tailored before signing in, without re-running the
  // (paid) analysis. Authenticated analyses are saved inline by /analyze.
  router.post("/", async (req, res) => {
    try {
      const { company, targetRole, jobDescription, matchScore, scores, analysis, parsed } =
        req.body || {};

      if (!analysis || !parsed) {
        return res.status(400).json({
          error: { code: "INVALID_INPUT", message: "analysis and parsed are required." },
        });
      }

      const created = await service.createApplication(req.auth.uid, {
        company,
        targetRole,
        jobDescription,
        matchScore,
        scores,
        analysis,
        parsed,
      });
      return res.status(201).json({ application: { id: created.id } });
    } catch (err) {
      console.error("-> Create application error:", err);
      return res.status(500).json({
        error: { code: "APPLICATION_CREATE_FAILED", message: "Failed to save application." },
      });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const application = await service.getApplication(req.auth.uid, req.params.id);
      if (!application) {
        return res.status(404).json({
          error: { code: "APPLICATION_NOT_FOUND", message: "Application not found." },
        });
      }
      return res.status(200).json({ application });
    } catch (err) {
      console.error("-> Get application error:", err);
      return res.status(500).json({
        error: { code: "APPLICATION_GET_FAILED", message: "Failed to load application." },
      });
    }
  });

  // PATCH updates either the pipeline status or, when `parsed` is present,
  // the edited resume payload (see updateParsed for what gets stored).
  router.patch("/:id", async (req, res) => {
    try {
      const { status, parsed, bulletChanges } = req.body || {};

      if (parsed !== undefined) {
        if (!parsed || typeof parsed !== "object" || !parsed.resumeData || typeof parsed.resumeData !== "object") {
          return res.status(400).json({
            error: { code: "INVALID_INPUT", message: "parsed.resumeData is required." },
          });
        }
        const application = await service.updateParsed(req.auth.uid, req.params.id, {
          parsed,
          bulletChanges,
        });
        if (!application) {
          return res.status(404).json({
            error: { code: "APPLICATION_NOT_FOUND", message: "Application not found." },
          });
        }
        return res.status(200).json({ application });
      }

      const application = await service.updateStatus(req.auth.uid, req.params.id, status);
      if (!application) {
        return res.status(404).json({
          error: { code: "APPLICATION_NOT_FOUND", message: "Application not found." },
        });
      }
      return res.status(200).json({ application });
    } catch (err) {
      if (err.code === "INVALID_STATUS") {
        return res.status(400).json({
          error: { code: "INVALID_STATUS", message: err.message },
        });
      }
      console.error("-> Update application error:", err);
      return res.status(500).json({
        error: { code: "APPLICATION_UPDATE_FAILED", message: "Failed to update application." },
      });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const deleted = await service.deleteApplication(req.auth.uid, req.params.id);
      if (!deleted) {
        return res.status(404).json({
          error: { code: "APPLICATION_NOT_FOUND", message: "Application not found." },
        });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("-> Delete application error:", err);
      return res.status(500).json({
        error: { code: "APPLICATION_DELETE_FAILED", message: "Failed to delete application." },
      });
    }
  });

  return router;
}

module.exports = createApplicationsRouter();
module.exports.createApplicationsRouter = createApplicationsRouter;
