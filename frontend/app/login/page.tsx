'use client';

import { useEffect, useState } from 'react';
import { Chrome } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/useAuth';
import { GoogleOneTap } from '@/components/auth/GoogleOneTap';
import { InAppBrowserGate } from '@/components/auth/InAppBrowserGate';
import { track } from '@/lib/analytics';

export default function LoginPage() {
  const { signInWithGoogle, loading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    track('login_page_viewed');
  }, []);

  const handleSignIn = async () => {
    try {
      setIsSubmitting(true);
      track('signin_started', { method: 'google' });
      await signInWithGoogle();
      track('signin_completed', { method: 'google' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-in failed.';
      track('signin_failed', { method: 'google', error: message });
      toast.error('Unable to sign in', { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <InAppBrowserGate>
      <div className="flex min-h-screen items-center justify-center px-4">
        <GoogleOneTap />
        <div className="w-full max-w-md rounded-2xl border border-border/85 bg-card/90 p-8 shadow-[0_1px_1px_rgba(15,23,42,0.05),0_14px_40px_rgba(15,23,42,0.06)]">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-primary/75">Tailor</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Continue with Google to access your resume analysis workspace.
          </p>

          <Button
            className="mt-6 w-full gap-2"
            size="lg"
            onClick={handleSignIn}
            disabled={loading || isSubmitting}
          >
            <Chrome className="h-4 w-4" />
            {isSubmitting ? 'Opening Google...' : 'Continue with Google'}
          </Button>
        </div>
      </div>
    </InAppBrowserGate>
  );
}
