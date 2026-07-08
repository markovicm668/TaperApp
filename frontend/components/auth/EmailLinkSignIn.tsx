'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/useAuth';
import { readEmailForSignIn, stripEmailLinkParams } from '@/lib/auth/emailLink';
import { track } from '@/lib/analytics';

type Status = 'idle' | 'sent' | 'confirmEmail' | 'completing';

function describeAuthError(error: unknown, phase: 'send' | 'complete'): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-email':
      case 'auth/missing-email':
        return phase === 'complete'
          ? 'This email does not match the address the sign-in link was sent to.'
          : 'Enter a valid email address.';
      case 'auth/invalid-action-code':
      case 'auth/expired-action-code':
        return 'This sign-in link has expired or was already used. Enter your email to get a new one.';
      case 'auth/too-many-requests':
      case 'auth/quota-exceeded':
        return 'Too many attempts. Please try again in a few minutes.';
    }
  }
  return error instanceof Error ? error.message : 'Sign-in failed.';
}

function isDeadLinkError(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    (error.code === 'auth/invalid-action-code' ||
      error.code === 'auth/expired-action-code')
  );
}

interface EmailLinkSignInProps {
  /** Extra guidance shown under the "check your email" message. */
  sentHint?: string;
}

export function EmailLinkSignIn({ sentHint }: EmailLinkSignInProps = {}) {
  const { sendEmailSignInLink, completeEmailLinkSignIn, isEmailLinkSignIn } =
    useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completionAttempted = useRef(false);

  const stripLinkFromUrl = useCallback(() => {
    window.history.replaceState(
      null,
      '',
      stripEmailLinkParams(window.location.href)
    );
  }, []);

  const completeSignIn = useCallback(
    async (candidateEmail: string) => {
      setStatus('completing');
      setError(null);
      try {
        const { isNewUser } = await completeEmailLinkSignIn(candidateEmail);
        track('signin_completed', {
          method: 'email_link',
          is_new_user: isNewUser,
        });
        // AppWrapper redirects away from /login once the user is set; strip
        // the consumed code so the URL left in history is clean.
        stripLinkFromUrl();
      } catch (err) {
        const message = describeAuthError(err, 'complete');
        track('signin_failed', {
          method: 'email_link',
          phase: 'complete',
          error: message,
        });
        if (isDeadLinkError(err)) {
          // The code is unusable; clean the URL so a refresh does not retry it.
          stripLinkFromUrl();
          setStatus('idle');
          toast.error('Unable to sign in', { description: message });
          return;
        }
        // Recoverable (mistyped email, transient failure): keep the code in
        // the URL so submitting a corrected email can retry.
        setEmail(candidateEmail);
        setStatus('confirmEmail');
        setError(message);
      }
    },
    [completeEmailLinkSignIn, stripLinkFromUrl]
  );

  useEffect(() => {
    // The ref guards against React strict mode double-mounting in dev: a
    // second attempt would fail because the first consumed the one-time code.
    if (completionAttempted.current) return;
    if (!isEmailLinkSignIn()) return;
    completionAttempted.current = true;

    const storedEmail = readEmailForSignIn();
    if (storedEmail) {
      void completeSignIn(storedEmail);
    } else {
      // Link was opened in a different browser than the one that requested it
      // (typical when the flow starts in an in-app browser).
      setStatus('confirmEmail');
    }
  }, [completeSignIn, isEmailLinkSignIn]);

  const handleSend = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email address.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      track('signin_started', { method: 'email_link' });
      await sendEmailSignInLink(trimmedEmail);
      track('signin_email_link_sent');
      if (status === 'sent') {
        toast.success('Sign-in link sent', { description: trimmedEmail });
      }
      setStatus('sent');
    } catch (err) {
      const message = describeAuthError(err, 'send');
      track('signin_failed', {
        method: 'email_link',
        phase: 'send',
        error: message,
      });
      if (err instanceof FirebaseError && err.code === 'auth/invalid-email') {
        setError(message);
      } else {
        toast.error('Unable to send sign-in link', { description: message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'completing') {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    );
  }

  if (status === 'confirmEmail') {
    return (
      <form
        onSubmit={event => {
          event.preventDefault();
          const trimmedEmail = email.trim();
          if (!trimmedEmail) {
            setError('Enter your email address.');
            return;
          }
          void completeSignIn(trimmedEmail);
        }}
        className="space-y-3"
      >
        <p className="text-sm text-muted-foreground">
          Confirm the email address this sign-in link was sent to.
        </p>
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={event => setEmail(event.target.value)}
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full">
          Confirm and sign in
        </Button>
      </form>
    );
  }

  if (status === 'sent') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground">
          We sent a sign-in link to <span className="font-medium">{email}</span>
          . It may take a minute to arrive — check your spam folder too.
        </p>
        {sentHint && <p className="text-xs text-muted-foreground">{sentHint}</p>}
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => void handleSend()}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Sending…' : 'Resend link'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setStatus('idle');
              setError(null);
            }}
            disabled={isSubmitting}
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        void handleSend();
      }}
      className="space-y-3"
    >
      <Input
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={event => setEmail(event.target.value)}
        disabled={isSubmitting}
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="submit"
        variant="outline"
        size="lg"
        className="w-full gap-2"
        disabled={isSubmitting}
      >
        <Mail className="h-4 w-4" />
        {isSubmitting ? 'Sending link…' : 'Email me a sign-in link'}
      </Button>
    </form>
  );
}
