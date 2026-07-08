'use client';

import { useEffect, useState } from 'react';
import { Chrome, FileDown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/useAuth';
import { EmailLinkSignIn } from '@/components/auth/EmailLinkSignIn';
import {
  BROWSER_LABEL,
  useInAppBrowser,
} from '@/components/auth/InAppBrowserGate';

interface DownloadGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SENT_HINT =
  'After you sign in, come back to this tab — your resume will be ready to download.';

export function DownloadGateDialog({ open, onOpenChange }: DownloadGateDialogProps) {
  const { user, signInWithGoogle } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const detection = useInAppBrowser();
  const isInAppBrowser = Boolean(detection?.isInAppBrowser);
  const inAppLabel = detection?.name ? BROWSER_LABEL[detection.name] : 'this app';

  // Auto-close once Firebase reports a user (popup completed successfully).
  useEffect(() => {
    if (open && user) onOpenChange(false);
  }, [open, user, onOpenChange]);

  const handleContinue = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
      // useEffect above closes the dialog when `user` flips truthy.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed.';
      toast.error('Unable to sign in', { description: message });
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Sign up to download your PDF
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1 space-y-4">
          <div className="space-y-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What you get
            </p>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm">
                <FileDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Download your tailored resume as a clean PDF</span>
              </li>
              <li className="flex items-center gap-3 text-sm">
                <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <strong className="font-semibold">Free credits</strong> to keep tailoring
                </span>
              </li>
            </ul>
          </div>
          {isInAppBrowser ? (
            <>
              {/* Google OAuth is blocked inside in-app browsers; the emailed
                  link opens in the real default browser instead. */}
              <p className="text-sm text-muted-foreground">
                Google sign-in isn&apos;t available inside {inAppLabel}. Enter
                your email and we&apos;ll send you a sign-in link that opens in
                your browser.
              </p>
              <EmailLinkSignIn sentHint={SENT_HINT} />
            </>
          ) : (
            <>
              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handleContinue}
                disabled={isSigningIn}
              >
                <Chrome className="h-4 w-4" />
                {isSigningIn ? 'Opening Google...' : 'Continue with Google'}
              </Button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  or
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <EmailLinkSignIn sentHint={SENT_HINT} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
