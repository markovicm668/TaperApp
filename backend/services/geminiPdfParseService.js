const { PDFParse } = require("pdf-parse");
const { parseResumeSections } = require("./geminiParseService");

async function parseResumePdf({ pdfBuffer, fileName }, options = {}) {
  const startedAt = Date.now();

  // eslint-disable-next-line no-console
  console.log(`-> Extracting text from PDF: ${fileName || "unknown"} (${pdfBuffer.length} bytes)`);

  let textResult;
  try {
    console.log(`-> [pdf-parse] Creating PDFParse instance...`);
    const parser = new PDFParse({ data: pdfBuffer });
    console.log(`-> [pdf-parse] Calling parser.load()...`);
    await parser.load();
    console.log(`-> [pdf-parse] load() complete. Calling parser.getText()...`);
    textResult = await parser.getText();
    console.log(`-> [pdf-parse] getText() complete. Pages: ${textResult.total}, text length: ${textResult.text?.length ?? 0}`);
    await parser.destroy();
    console.log(`-> [pdf-parse] Parser destroyed. Text extraction took ${Date.now() - startedAt}ms`);
  } catch (err) {
    console.error(`-> [pdf-parse] FAILED after ${Date.now() - startedAt}ms:`, err.message);
    console.error(`-> [pdf-parse] Error stack:`, err.stack);
    const parseError = new Error("Failed to read PDF file. It may be corrupted or password-protected.");
    parseError.code = "PARSE_FAILED";
    throw parseError;
  }

  const extractedText = textResult.text;

  if (!extractedText || !extractedText.trim()) {
    console.warn(`-> [pdf-parse] Empty text extracted. Raw textResult:`, JSON.stringify(textResult).slice(0, 500));
    const err = new Error("Could not extract text from PDF. The file may be scanned/image-only.");
    err.code = "PARSE_FAILED";
    throw err;
  }

  console.log(`-> [pdf-parse] Extracted ${extractedText.length} chars from ${textResult.total} page(s) in ${Date.now() - startedAt}ms`);
  console.log(`-> [pdf-parse] First 200 chars: ${extractedText.slice(0, 200).replace(/\n/g, "\\n")}`);
  console.log(`-> [pdf-parse] Forwarding to parseResumeSections()...`);

  const parseResult = await parseResumeSections(
    { resumeText: extractedText, inputType: "file", fileName },
    options
  );

  console.log(`-> [pdf-parse] parseResumeSections() complete. Total PDF pipeline: ${Date.now() - startedAt}ms`);

  return parseResult;
}

module.exports = {
  parseResumePdf,
};
