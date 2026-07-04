const express = require("express");
const { generatePdfFromHtml, renderPaginatedHtml } = require("../services/pdfService");
const { generateResumeHtml, validateResume } = require("../services/resumeTemplate");
const requireAuth = require("../middleware/requireAuth");

function createExportRouter({
  renderResumeHtml = generateResumeHtml,
  renderPdf = generatePdfFromHtml,
  paginateHtml = renderPaginatedHtml,
  validate = validateResume,
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

  router.post("/pdf", requireAuth, async (req, res) => {
    try {
      const { resume, template } = req.body || {};
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
