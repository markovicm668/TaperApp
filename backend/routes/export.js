const express = require("express");
const { generatePdfFromHtml, renderPaginatedHtml } = require("../services/pdfService");
const { generateResumeHtml, validateResume } = require("../services/resumeTemplate");
const requireAuth = require("../middleware/requireAuth");
const { getApplication } = require("../services/applicationService");
const { isAnonymousRequest } = require("../utils/authClaims");

function createExportRouter({
  renderResumeHtml = generateResumeHtml,
  renderPdf = generatePdfFromHtml,
  paginateHtml = renderPaginatedHtml,
  validate = validateResume,
  auth = requireAuth,
  getOwnedApplication = getApplication,
} = {}) {
  const router = express.Router();

  // Preview is open to anonymous users — it renders HTML from a payload the
  // client already has, no AI/LLM cost. PDF export below requires auth.
  router.post("/preview", async (req, res) => {
    try {
      const { resume, template } = req.body || {};
      const validation = validate(resume);
      if (!validation.ok) {
        return res.status(400).json({
          error: { code: "INVALID_INPUT", message: validation.message },
        });
      }
      let html = renderResumeHtml(resume, { template });
      // Paginate server-side so the preview shows the exact page breaks the
      // PDF will have. Client-side measurement differs per device/engine
      // (mobile WebKit notoriously so) and must not decide page breaks.
      try {
        html = await paginateHtml(html);
      } catch (paginateErr) {
        console.warn(
          "-> Preview pagination failed; returning unpaginated HTML:",
          paginateErr?.message || paginateErr
        );
      }
      return res.status(200).json({ html });
    } catch (err) {
      console.error("-> Preview error:", err);
      return res.status(500).json({
        error: {
          code: err.code || "PREVIEW_FAILED",
          message: err.message || "Failed to generate preview.",
        },
      });
    }
  });

  // The PDF is the paid deliverable, so it is only rendered for content tied
  // to an application the caller owns — and an application can only exist via
  // a billed moment (analyze charge, save charge, or the account's one free
  // first save). Anonymous trial users see the free preview above; the
  // download requires a real account. This keeps a crafted direct API call
  // from downloading work that was never paid for.
  router.post("/pdf", auth, async (req, res) => {
    try {
      const { resume, template, applicationId } = req.body || {};
      console.log("-> PDF export request received.");

      const validation = validate(resume);
      if (!validation.ok) {
        return res.status(400).json({
          error: {
            code: "INVALID_INPUT",
            message: validation.message,
          },
        });
      }

      if (isAnonymousRequest(req)) {
        return res.status(403).json({
          error: { code: "ANONYMOUS_FORBIDDEN", message: "Sign in to download your resume." },
        });
      }

      const ownedApplication = applicationId
        ? await getOwnedApplication(req.auth.uid, applicationId)
        : null;
      if (!ownedApplication) {
        return res.status(402).json({
          error: {
            code: "APPLICATION_REQUIRED",
            message: "Save this analysis to your account to download it.",
          },
        });
      }

      const html = renderResumeHtml(resume, { template });
      const pdfBuffer = await renderPdf(html);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="resume.pdf"');
      return res.status(200).send(pdfBuffer);
    } catch (err) {
      console.error("-> PDF export error:", err);
      return res.status(500).json({
        error: {
          code: err.code || "PDF_EXPORT_FAILED",
          message: err.message || "Failed to export resume PDF.",
        },
      });
    }
  });

  return router;
}

module.exports = createExportRouter();
module.exports.createExportRouter = createExportRouter;
