const express = require("express");
const { generatePdfFromHtml } = require("../services/pdfService");
const { generateResumeHtml, validateResume } = require("../services/resumeTemplate");

function createExportRouter({
  renderResumeHtml = generateResumeHtml,
  renderPdf = generatePdfFromHtml,
  validate = validateResume,
} = {}) {
  const router = express.Router();

  router.post("/pdf", async (req, res) => {
    try {
      const { resume } = req.body || {};
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

      const html = renderResumeHtml(resume);
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
