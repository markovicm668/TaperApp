'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Matches the old `sticky top-4` offset.
const MARGIN_PX = 16;
// Tailwind lg breakpoint — below it the results page uses the mobile tab
// switcher and the preview scrolls in normal page flow.
const DESKTOP_QUERY = '(min-width: 1024px)';

// Sticky wrapper for content that may be taller than the viewport.
// When it fits, it acts like plain `sticky top-4`. When taller, it scrolls
// with the page and pins its bottom edge while scrolling down / its top edge
// while scrolling up ("smart sticky"). CSS alone can't express this: sticky
// clamps against the element's natural flow position, so on every scroll
// direction flip we re-anchor that position (via margin-top) to wherever the
// element is currently pinned, letting it follow the new direction at once.
export function SmartSticky({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const mql = window.matchMedia(DESKTOP_QUERY);
    let lastY = window.scrollY;
    let lastDown: boolean | null = null;
    let raf = 0;

    const isTall = () => el.offsetHeight > window.innerHeight - MARGIN_PX * 2;

    const applyConstraints = () => {
      if (!mql.matches || !isTall()) {
        el.style.top = `${MARGIN_PX}px`;
        el.style.bottom = '';
        el.style.marginTop = '';
        lastDown = null;
        return;
      }
      // Symmetric sticky insets clamp the element between "bottom pinned"
      // (scrolling down) and "top pinned" (scrolling up).
      const clamp = window.innerHeight - el.offsetHeight - MARGIN_PX;
      el.style.top = `${clamp}px`;
      el.style.bottom = `${clamp}px`;
    };

    const onScrollFrame = () => {
      raf = 0;
      const y = window.scrollY;
      if (y === lastY) return;
      const down = y > lastY;
      lastY = y;
      if (!mql.matches || !isTall()) return;
      if (lastDown !== null && down !== lastDown) {
        const offset =
          el.getBoundingClientRect().top - parent.getBoundingClientRect().top;
        // Keep the anchor inside the column so it never stretches the page.
        const maxOffset = Math.max(0, parent.offsetHeight - el.offsetHeight);
        el.style.marginTop = `${Math.min(Math.max(offset, 0), maxOffset)}px`;
      }
      lastDown = down;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(onScrollFrame);
    };

    applyConstraints();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', applyConstraints);
    mql.addEventListener('change', applyConstraints);
    const ro = new ResizeObserver(applyConstraints);
    ro.observe(el);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', applyConstraints);
      mql.removeEventListener('change', applyConstraints);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={ref} style={{ position: 'sticky', top: MARGIN_PX }}>
      {children}
    </div>
  );
}
