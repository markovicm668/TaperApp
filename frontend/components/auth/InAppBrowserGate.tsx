'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, Copy, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  detectInAppBrowser,
  type InAppBrowserDetection,
  type InAppBrowserName,
} from '@/lib/auth/detectInAppBrowser';

const BROWSER_LABEL: Record<InAppBrowserName, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'X (Twitter)',
  webview: 'an in-app browser',
};

function openInSystemBrowser(platform: 'ios' | 'android' | undefined) {
  if (typeof window === 'undefined') return;
  const { host, pathname, search, hash } = window.location;

  if (platform === 'android') {
    window.location.href = `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;end`;
    return;
  }

  // iOS (and any unknown platform): try Safari's private scheme. If the
  // embedded browser refuses, nothing happens and the Copy link fallback
  // remains visible.
  window.location.href = `x-safari-https://${host}${pathname}${search}${hash}`;
}

async function copyCurrentUrl() {
  if (typeof window === 'undefined') return;
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied', {
      description: 'Paste it into Safari or Chrome to continue.',
    });
  } catch {
    toast.error('Could not copy link', {
      description: url,
    });
  }
}

function GateScreen({ detection }: { detection: InAppBrowserDetection }) {
  const appLabel = detection.name ? BROWSER_LABEL[detection.name] : 'this app';
  const primaryLabel =
    detection.platform === 'android' ? 'Open in Chrome' : 'Open in Safari';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/85 bg-card/90 p-8 shadow-[0_1px_1px_rgba(15,23,42,0.05),0_14px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 inline-flex rounded-xl bg-secondary/80 p-3">
          <AlertCircle className="h-5 w-5 text-primary" />
        </div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Please open in your browser
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Google blocks sign-in from inside {appLabel}. Tap the button below to
          reopen this page in your default browser, where you can sign in
          normally.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() => openInSystemBrowser(detection.platform)}
          >
            <ExternalLink className="h-4 w-4" />
            {primaryLabel}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full gap-2"
            onClick={copyCurrentUrl}
          >
            <Copy className="h-4 w-4" />
            Copy link
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground/80">
          If the button above doesn&apos;t work, copy the link and paste it into
          Safari or Chrome.
        </p>
      </div>
    </div>
  );
}

export function InAppBrowserGate({ children }: { children: ReactNode }) {
  const [detection, setDetection] = useState<InAppBrowserDetection | null>(
    null
  );

  useEffect(() => {
    setDetection(detectInAppBrowser());
  }, []);

  if (detection?.isInAppBrowser) {
    return <GateScreen detection={detection} />;
  }

  return <>{children}</>;
}
