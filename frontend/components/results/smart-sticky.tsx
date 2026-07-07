'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Matches the old `sticky top-4` offset.
const MARGIN_PX = 16;
// Tailwind lg breakpoint — below it the results page uses the mobile tab
// switcher and the preview scrolls in normal page flow.
const DESKTOP_QUERY = '(min-width: 1024px)';

// Sticky wrapper for content that may be taller than the viewport.
// When it fits, it acts like plain `sticky top-4`. When taller, it follows
// the page and pins its bottom edge while scrolling down / its top edge while
// scrolling up. CSS sticky alone can't express this — its constraints clamp
// against the element's natural flow position — so the scroll handler walks
// the `top` inset by the scroll delta, clamped between the two pin positions.
// Mid-page the natural position is far above the viewport, so the sticky
// position equals the inset exactly; at the column edges normal flow and the
// containing block take over as with plain sticky.
export function SmartSticky({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mql = window.matchMedia(DESKTOP_QUERY);
    let lastY = window.scrollY;
    let topPx = MARGIN_PX;
    let raf = 0;

    const isTall = () => el.offsetHeight > window.innerHeight - MARGIN_PX * 2;

    const setTop = (value: number) => {
      topPx = value;
      el.style.top = `${value}px`;
    };

    const clampTop = (value: number) => {
      const minTop = window.innerHeight - el.offsetHeight - MARGIN_PX;
      return Math.min(Math.max(value, minTop), MARGIN_PX);
    };

    const applyConstraints = () => {
      el.style.bottom = '';
      el.style.marginTop = '';
      if (!mql.matches || !isTall()) {
        setTop(MARGIN_PX);
        return;
      }
      setTop(clampTop(topPx));
    };

    const onScrollFrame = () => {
      raf = 0;
      const delta = window.scrollY - lastY;
      lastY = window.scrollY;
      if (delta === 0 || !mql.matches || !isTall()) return;
      setTop(clampTop(topPx - delta));
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
