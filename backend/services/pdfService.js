const puppeteer = require("puppeteer");

// A4 at 96 dpi — must stay in sync with frontend/components/results/resume-preview.tsx
const A4_WIDTH_PX = Math.round((210 * 96) / 25.4); // 794
const A4_HEIGHT_PX = Math.round((297 * 96) / 25.4); // 1123
const PAGE_CONTENT_HEIGHT_PX = Math.round(((297 - 40) * 96) / 25.4); // 971

// One long-lived browser shared by PDF export and preview pagination. A cold
// launch costs ~0.5-1s, which is too slow for the debounced preview endpoint.
let browserPromise = null;

async function getBrowser() {
  const existing = browserPromise;
  if (existing) {
    try {
      const browser = await existing;
      if (browser.connected) return browser;
    } catch (err) {
      // fall through and relaunch
    }
    if (browserPromise === existing) browserPromise = null;
  }
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });
  }
  return browserPromise;
}

async function closeBrowser() {
  const existing = browserPromise;
  browserPromise = null;
  if (existing) {
    try {
      const browser = await existing;
      await browser.close();
    } catch (err) {
      // already gone
    }
  }
}

// Splits the flat template body into fixed-height .pdf-page divs. This is the
// single source of truth for page breaks: it runs here (in headless Chrome)
// for BOTH the PDF and the preview HTML, so every client sees the same pages
// regardless of its own fonts or rendering engine. The frontend keeps a copy
// of this algorithm only as a fallback for unpaginated HTML (see
// resume-preview.tsx paginateDocument).
function paginateInBrowser(contentHeight) {
  const body = document.body;
  if (!body || body.querySelector(".pdf-page")) return;

  const measure = document.createElement("div");
  measure.style.cssText =
    "width:210mm;padding:20mm 15mm;box-sizing:border-box;position:absolute;left:-99999px;top:0;";
  while (body.firstChild) measure.appendChild(body.firstChild);
  body.appendChild(measure);

  let topLevel = Array.from(measure.children);
  while (
    topLevel.length > 0 &&
    topLevel.every((el) => el.classList.contains("page"))
  ) {
    topLevel = topLevel.flatMap((el) => Array.from(el.children));
  }
  if (topLevel.length === 0) {
    while (measure.firstChild) body.appendChild(measure.firstChild);
    body.removeChild(measure);
    return;
  }

  const getHeight = (el) => {
    const s = getComputedStyle(el);
    return el.offsetHeight + (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0);
  };

  const atoms = [];
  for (const child of topLevel) {
    if (child.classList.contains("section")) {
      const kids = Array.from(child.children);
      const h2 = kids.find((c) => c.tagName === "H2") || null;
      const items = h2 ? kids.filter((c) => c !== h2) : kids;
      if (h2 && items.length > 0) {
        atoms.push({ els: [h2, items[0]], height: getHeight(h2) + getHeight(items[0]), sec: child });
        for (let i = 1; i < items.length; i++) {
          atoms.push({ els: [items[i]], height: getHeight(items[i]), sec: child });
        }
      } else if (kids.length > 0) {
        for (const c of kids) atoms.push({ els: [c], height: getHeight(c), sec: child });
      } else {
        atoms.push({ els: [child], height: getHeight(child), sec: null });
      }
    } else {
      atoms.push({ els: [child], height: getHeight(child), sec: null });
    }
  }

  const pages = [[]];
  let curH = 0;
  for (const atom of atoms) {
    if (curH + atom.height > contentHeight && pages[pages.length - 1].length > 0) {
      pages.push([]);
      curH = 0;
    }
    pages[pages.length - 1].push(atom);
    curH += atom.height;
  }

  const fragment = document.createDocumentFragment();
  for (const pageAtoms of pages) {
    const pageDiv = document.createElement("div");
    pageDiv.className = "pdf-page";
    let curSec = null;
    let curSecSrc = null;
    for (const atom of pageAtoms) {
      if (atom.sec) {
        if (curSecSrc !== atom.sec) {
          curSec = document.createElement("div");
          curSec.className = atom.sec.className;
          pageDiv.appendChild(curSec);
          curSecSrc = atom.sec;
        }
        for (const el of atom.els) curSec.appendChild(el);
      } else {
        curSec = null;
        curSecSrc = null;
        for (const el of atom.els) pageDiv.appendChild(el);
      }
    }
    fragment.appendChild(pageDiv);
  }

  body.innerHTML = "";
  body.appendChild(fragment);

  const style = document.createElement("style");
  style.textContent = `
    html, body { margin: 0; padding: 0; }
    .pdf-page {
      width: 210mm; height: 297mm;
      padding: 20mm 15mm;
      box-sizing: border-box;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }
    .pdf-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  `;
  document.head.appendChild(style);
}

async function withPaginatedPage(html, waitUntil, run) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX });
    await page.setContent(html, { waitUntil });
    // Fonts are embedded as data URIs but still load asynchronously; measuring
    // before they apply would paginate with fallback-font metrics.
    await page.evaluateHandle("document.fonts.ready");
    await page.evaluate(paginateInBrowser, PAGE_CONTENT_HEIGHT_PX);
    return await run(page);
  } finally {
    await page.close().catch(() => {});
  }
}

async function generatePdfFromHtml(html) {
  return withPaginatedPage(html, "networkidle0", (page) =>
    page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0",
        bottom: "0",
        left: "0",
        right: "0",
      },
    })
  );
}

// Returns the resume HTML with page breaks already applied (.pdf-page divs),
// so the preview shows exactly the pages the PDF will have. "load" instead of
// "networkidle0" keeps the debounced preview snappy — the template HTML is
// self-contained (no network requests).
async function renderPaginatedHtml(html) {
  return withPaginatedPage(html, "load", (page) => page.content());
}

module.exports = {
  generatePdfFromHtml,
  renderPaginatedHtml,
  closeBrowser,
};
