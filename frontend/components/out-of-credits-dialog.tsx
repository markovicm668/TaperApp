'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InviteFriendPanel } from '@/components/invite-friend-panel';
import { track } from '@/lib/analytics';
import { createCheckout, fetchUserProfile, type CreditPackId } from '@/lib/api';
import { CREDIT_PACKS } from '@/lib/billing';
import { openLemonCheckout } from '@/lib/lemonsqueezy';
import { useAuth } from '@/lib/auth/useAuth';
import { useTokens } from '@/lib/tokens/TokenContext';

interface OutOfCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 10;

export function OutOfCreditsDialog({ open, onOpenChange }: OutOfCreditsDialogProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { tokensRemaining, setTokensRemaining, refreshTokens } = useTokens();
  const [purchasingPackId, setPurchasingPackId] = useState<CreditPackId | null>(null);

  // Cancels an in-flight balance poll if the component unmounts; kept in a ref
  // so the poll started by one render isn't restarted by later ones.
  const pollCancelledRef = useRef(false);
  useEffect(() => {
    pollCancelledRef.current = false;
    return () => {
      pollCancelledRef.current = true;
    };
  }, []);

  // The webhook that grants credits typically lands a few seconds after the
  // overlay reports Checkout.Success, so poll the profile until the balance
  // rises instead of trusting the success event alone.
  const pollForCredits = async (balanceBefore: number) => {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      if (pollCancelledRef.current) return;
      try {
        const profile = await fetchUserProfile();
        if (profile.tokensRemaining > balanceBefore) {
          setTokensRemaining(profile.tokensRemaining);
          toast.success('Credits added', {
            description: `You now have ${profile.tokensRemaining} credits.`,
          });
          return;
        }
      } catch {
        // Transient fetch failure — keep polling.
      }
    }
    if (pollCancelledRef.current) return;
    toast.info('Credits are on the way', {
      description: 'Your payment went through — refresh in a moment if the balance has not updated.',
    });
    void refreshTokens();
  };

  const handleBuy = async (packId: CreditPackId) => {
    track('upsell_buy_credits_clicked', { source: 'out_of_credits_dialog', pack: packId });

    // The dialog is only shown to signed-in users today; this guard is
    // insurance in case a future caller opens it for guests.
    if (!user) {
      toast.info('Sign in to buy credits');
      router.push('/login');
      return;
    }

    setPurchasingPackId(packId);
    const balanceBefore = tokensRemaining;
    try {
      const { url } = await createCheckout(packId);
      await openLemonCheckout(url, {
        onSuccess: () => {
          track('credits_purchase_completed', { pack: packId });
          toast.success('Payment received', {
            description: 'Adding credits to your account…',
          });
          void pollForCredits(balanceBefore);
          onOpenChange(false);
        },
      });
    } catch (err) {
      track('credits_purchase_failed', {
        pack: packId,
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error('Could not start checkout', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPurchasingPackId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">You&apos;re out of credits</DialogTitle>
          <DialogDescription>
            Invite a friend to unlock more credits instantly, or buy a credit pack below.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-1 space-y-4">
          <InviteFriendPanel source="out_of_credits_dialog" />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            {CREDIT_PACKS.map(pack => (
              <Button
                key={pack.id}
                variant={pack.highlight ? 'default' : 'outline'}
                className="w-full justify-between"
                disabled={purchasingPackId !== null}
                onClick={() => handleBuy(pack.id)}
              >
                <span className="flex items-center gap-2">
                  {purchasingPackId === pack.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-4 w-4" />
                  )}
                  {pack.name} — {pack.credits} credits
                </span>
                <span className="text-sm font-semibold">{pack.priceLabel}</span>
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
