'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// A4 dimensions at 96dpi — same as Puppeteer PDF output (see backend/services/pdfService.js).
const NATURAL_WIDTH_PX = Math.round((210 * 96) / 25.4); // 794
const PAGE_HEIGHT_PX = (297 * 96) / 25.4; // 1122.52 — .pdf-page height (297mm)
const PAGE_GAP_PX = (8 * 96) / 25.4; // 30.24 — body flex gap (8mm) in injectPreviewStyles
// Content-area height per page: 297mm minus 20mm top + 20mm bottom margins (same as Puppeteer).
const PAGE_CONTENT_HEIGHT_PX = Math.round(((297 - 40) * 96) / 25.4); // 971

interface ResumePreviewProps {
  html: string | null;
  isLoading: boolean;
  error: string | null;
  className?: string;
}

function injectPreviewStyles(html: string): string {
  const previewStyle = `
<style id="__preview-overrides">
  html, body {
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box;
    overflow: hidden !important;
    -webkit-text-size-adjust: 100% !important;
    text-size-adjust: 100% !important;
  }
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8mm;
  }
  .pdf-page {
    width: 210mm;
    height: 297mm;
    padding: 20mm 15mm !important;
    background: #fff !important;
    box-sizing: border-box;
    overflow: hidden;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
  }
</style>`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${previewStyle}</head>`);
  }
  return previewStyle + html;
}

type Atom = {
  els: HTMLElement[];
  height: number;
  sectionSrc: HTMLElement | null;
};

// The backend now returns preview HTML already split into .pdf-page divs by
// the same headless-Chrome code that paginates the PDF (see
// backend/services/pdfService.js renderPaginatedHtml), so page breaks match
// the download exactly on every device. This client-side copy of the
// algorithm is only a fallback for unpaginated HTML (e.g. an older backend).
function paginateDocument(doc: Document): void {
  const body = doc.body;
  if (!body || body.querySelector('.pdf-page')) return;

  // Move existing children into an offscreen measurement container sized
  // like the PDF content area, so offsetHeight reflects the single-column
  // A4 layout Puppeteer sees.
  const measure = doc.createElement('div');
  measure.style.cssText =
    'width: 210mm; padding: 20mm 15mm; box-sizing: border-box; position: absolute; left: -99999px; top: 0;';
  while (body.firstChild) measure.appendChild(body.firstChild);
  body.appendChild(measure);

  // The backend template wraps all content in a single <div class="page"> with
  // padding:0 — it's an organizational wrapper, not a page boundary. Unwrap it
  // (any number of levels) so the real top-level content blocks become atoms.
  let topLevel = Array.from(measure.children) as HTMLElement[];
  while (
    topLevel.length > 0 &&
    topLevel.every(el => el.classList.contains('page'))
  ) {
    topLevel = topLevel.flatMap(el => Array.from(el.children) as HTMLElement[]);
  }
  if (topLevel.length === 0) {
    while (measure.firstChild) body.appendChild(measure.firstChild);
    body.removeChild(measure);
    return;
  }

  const getHeight = (el: HTMLElement): number => {
    const s = doc.defaultView!.getComputedStyle(el);
    const mt = parseFloat(s.marginTop) || 0;
    const mb = parseFloat(s.marginBottom) || 0;
    return el.offsetHeight + mt + mb;
  };

  const atoms: Atom[] = [];
  for (const child of topLevel) {
    if (child.classList.contains('section')) {
      const sectionChildren = Array.from(child.children) as HTMLElement[];
      const h2 = sectionChildren.find(c => c.tagName === 'H2') ?? null;
      const items = h2 ? sectionChildren.filter(c => c !== h2) : sectionChildren;
      if (h2 && items.length > 0) {
        // Keep section heading with its first item to avoid orphaned headings.
        atoms.push({
          els: [h2, items[0]],
          height: getHeight(h2) + getHeight(items[0]),
          sectionSrc: child,
        });
        for (let i = 1; i < items.length; i++) {
          atoms.push({
            els: [items[i]],
            height: getHeight(items[i]),
            sectionSrc: child,
          });
        }
      } else if (sectionChildren.length > 0) {
        for (const c of sectionChildren) {
          atoms.push({ els: [c], height: getHeight(c), sectionSrc: child });
        }
      } else {
        atoms.push({ els: [child], height: getHeight(child), sectionSrc: null });
      }
    } else {
      atoms.push({ els: [child], height: getHeight(child), sectionSrc: null });
    }
  }

  // Pack atoms into pages without splitting any atom across a page boundary.
  const pages: Atom[][] = [[]];
  let curH = 0;
  for (const atom of atoms) {
    if (curH + atom.height > PAGE_CONTENT_HEIGHT_PX && pages[pages.length - 1].length > 0) {
      pages.push([]);
      curH = 0;
    }
    pages[pages.length - 1].push(atom);
    curH += atom.height;
  }

  const fragment = doc.createDocumentFragment();
  for (const pageAtoms of pages) {
    const pageDiv = doc.createElement('div');
    pageDiv.className = 'pdf-page';
    let currentSection: HTMLElement | null = null;
    let currentSectionSrc: HTMLElement | null = null;
    for (const atom of pageAtoms) {
      if (atom.sectionSrc) {
        if (currentSectionSrc !== atom.sectionSrc) {
          currentSection = doc.createElement('div');
          currentSection.className = atom.sectionSrc.className;
          pageDiv.appendChild(currentSection);
          currentSectionSrc = atom.sectionSrc;
        }
        for (const el of atom.els) currentSection!.appendChild(el);
      } else {
        currentSection = null;
        currentSectionSrc = null;
        for (const el of atom.els) pageDiv.appendChild(el);
      }
    }
    fragment.appendChild(pageDiv);
  }

  body.innerHTML = '';
  body.appendChild(fragment);
}

export function ResumePreview({ html, isLoading, error, className }: ResumePreviewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const docResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [naturalHeight, setNaturalHeight] = useState(0);

  const previewHtml = html ? injectPreviewStyles(html) : null;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setNaturalHeight(0);
    if (docResizeObserverRef.current) {
      docResizeObserverRef.current.disconnect();
      docResizeObserverRef.current = null;
    }
  }, [html]);

  useEffect(() => {
    return () => {
      docResizeObserverRef.current?.disconnect();
      docResizeObserverRef.current = null;
    };
  }, []);

  // For paginated documents the height is arithmetic — pages are fixed
  // 297mm tall with an 8mm gap — so we never depend on scrollHeight, which
  // mobile WebKit misreports inside scaled/auto-sized iframes.
  const computeNaturalHeight = (doc: Document): number => {
    const pageCount = doc.querySelectorAll('.pdf-page').length;
    if (pageCount > 0) {
      return Math.round(pageCount * PAGE_HEIGHT_PX + (pageCount - 1) * PAGE_GAP_PX);
    }
    return doc.documentElement.scrollHeight;
  };

  const handleLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const doc = e.currentTarget.contentDocument;
    if (!doc) return;

    const finalize = () => {
      // The iframe remounts on html change (key={previewHtml}); skip if this
      // document was detached while we waited for fonts.
      if (!doc.defaultView) return;

      paginateDocument(doc);
      setNaturalHeight(computeNaturalHeight(doc));

      if (docResizeObserverRef.current) {
        docResizeObserverRef.current.disconnect();
        docResizeObserverRef.current = null;
      }

      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          const h = computeNaturalHeight(doc);
          if (h > 0) {
            setNaturalHeight(prev => (prev === h ? prev : h));
          }
        });
        ro.observe(doc.documentElement);
        docResizeObserverRef.current = ro;
      }
    };

    if (doc.body?.querySelector('.pdf-page')) {
      // Server already paginated — page heights are fixed, nothing to wait for.
      finalize();
    } else {
      // Fallback pagination measures text, so wait for fonts to apply first.
      const fontsReady: Promise<unknown> | undefined = doc.fonts?.ready;
      if (fontsReady && typeof fontsReady.then === 'function') {
        fontsReady.then(finalize, finalize);
      } else {
        finalize();
      }
    }
  };

  const scale = containerWidth > 0 ? containerWidth / NATURAL_WIDTH_PX : 1;
  const scaledHeight = naturalHeight > 0 ? Math.round(naturalHeight * scale) : 0;

  const showSpinner = isLoading || (previewHtml !== null && naturalHeight === 0);
  const spinnerHeight = scaledHeight > 0 ? scaledHeight : 400;

  return (
    <div ref={wrapperRef} className={cn('relative w-full', className)}>
      {showSpinner && (
        <div
          className="flex items-center justify-center rounded-xl bg-muted/40"
          style={{ height: spinnerHeight }}
        >
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {!isLoading && error && (
        <div className="flex min-h-[200px] items-center justify-center p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {!isLoading && !error && !previewHtml && (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          Preview will appear here
        </div>
      )}
      {previewHtml && (
        // Wrapper reserves the correct scaled height in the document flow.
        // The iframe is absolutely positioned so its full 794px width never
        // affects layout or triggers page-level scrollbars.
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: scaledHeight > 0 ? scaledHeight : undefined,
            overflow: 'hidden',
            visibility: naturalHeight === 0 ? 'hidden' : 'visible',
          }}
        >
          <iframe
            key={previewHtml}
            srcDoc={previewHtml}
            title="Resume Preview"
            onLoad={handleLoad}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: NATURAL_WIDTH_PX,
              height: naturalHeight > 0 ? naturalHeight : '100%',
              border: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            sandbox="allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}
