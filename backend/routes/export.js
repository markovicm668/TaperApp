const express = require("express");
const { generatePdfFromHtml } = require("../services/pdfService");
const { generateResumeHtml, validateResume } = require("../services/resumeTemplate");
const requireAuth = require("../middleware/requireAuth");

function createExportRouter({
  renderResumeHtml = generateResumeHtml,
  renderPdf = generatePdfFromHtml,
  validate = validateResume,
} = {}) {
  const router = express.Router();

  // Preview is open to anonymous users — it just renders HTML from a payload
  // the client already has, no AI/LLM cost. PDF export below requires auth.
  router.post("/preview", async (req, res) => {
    try {
      const { resume, template } = req.body || {};
      const validation = validate(resume);
      if (!validation.ok) {
        return res.status(400).json({
          error: { code: "INVALID_INPUT", message: validation.message },
        });
      }
      const html = renderResumeHtml(resume, { template });
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
