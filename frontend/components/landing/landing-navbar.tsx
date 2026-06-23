'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { track } from '@/lib/analytics';

/**
 * Marketing navbar for the landing page (logged-out visitors only). Kept separate from
 * the shared AppNavbar so its scroll-driven styling never leaks into the in-app pages.
 *
 * At the top it blends into the page (transparent bottom border); once the user scrolls
 * a little, a thin separating line fades in and the glassy background turns slightly
 * more opaque.
 */
export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // The landing page scrolls inside <main className="overflow-auto">, so we can't
    // rely on window.scrollY alone — watch both the window and the main scroller.
    const main = document.querySelector('main');
    const onScroll = () => {
      const y = Math.max(window.scrollY, main?.scrollTop ?? 0);
      setScrolled(y > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    main?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      main?.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b backdrop-blur-md backdrop-saturate-150 transition-colors duration-300',
        scrolled ? 'border-border/60 bg-background/95' : 'border-transparent bg-background/80',
      )}
    >
      <div className="mx-auto flex h-[72px] max-w-[1140px] items-center justify-between px-5 sm:px-7">
        <Link
          href="/"
          onClick={() => track('nav_logo_clicked')}
          className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
        >
          <span className="font-serif text-xl font-semibold tracking-tight">Tailor</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <Link href="/login" onClick={() => track('nav_signin_clicked')}>
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
          </div>
          <Link href="/login" onClick={() => track('nav_get_started_clicked')}>
            <Button size="sm" className="gap-1.5">
              Get Started
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
