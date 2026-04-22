'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// 210mm at 96dpi (the A4 width used by Puppeteer and our injected CSS)
const NATURAL_WIDTH_PX = Math.round((210 * 96) / 25.4); // 794

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
  .page, body > * {
    width: 210mm;
    min-height: 297mm;
    margin: 0 !important;
    padding: 20mm 15mm !important;
    background: #fff !important;
    box-sizing: border-box;
  }
</style>`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${previewStyle}</head>`);
  }
  return previewStyle + html;
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

  const handleLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const doc = e.currentTarget.contentDocument;
    if (!doc) return;

    setNaturalHeight(doc.documentElement.scrollHeight);

    if (docResizeObserverRef.current) {
      docResizeObserverRef.current.disconnect();
      docResizeObserverRef.current = null;
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        const h = doc.documentElement.scrollHeight;
        if (h > 0) {
          setNaturalHeight(prev => (prev === h ? prev : h));
        }
      });
      ro.observe(doc.documentElement);
      docResizeObserverRef.current = ro;
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
