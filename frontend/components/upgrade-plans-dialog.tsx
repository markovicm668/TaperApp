'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSearch, Loader2, Sparkles } from 'lucide-react';
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
import { createCheckout, fetchPortalUrl, fetchUserProfile, type PlanId } from '@/lib/api';
import { PLANS, PLAN_LABEL } from '@/lib/billing';
import { openLemonCheckout } from '@/lib/lemonsqueezy';
import { useAuth } from '@/lib/auth/useAuth';
import { useTokens } from '@/lib/tokens/TokenContext';
import { cn } from '@/lib/utils';

export type UpgradeSource = 'nav' | 'sidebar' | 'out_of_credits' | 'results_lock' | 'settings';

interface UpgradePlansDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: UpgradeSource;
  title?: string;
  description?: string;
  showInvitePanel?: boolean;
}

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

// The single upgrade surface: $4/week, $9/month, $29 lifetime. Used by the
// navbar, the sidebar, the out-of-credits flow, and settings.
export function UpgradePlansDialog({
  open,
  onOpenChange,
  source,
  title = 'Tailor Pro',
  description,
  showInvitePanel = false,
}: UpgradePlansDialogProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { plan: currentPlan, entitled, hasSubscription, applyProfile, refreshTokens } = useTokens();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('monthly');
  const [purchasing, setPurchasing] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Cancels an in-flight activation poll if the component unmounts; kept in a
  // ref so the poll started by one render isn't restarted by later ones.
  const pollCancelledRef = useRef(false);
  useEffect(() => {
    pollCancelledRef.current = false;
    return () => {
      pollCancelledRef.current = true;
    };
  }, []);

  // Plan activation arrives via the payment webhook a few seconds after the
  // overlay reports Checkout.Success, so poll the profile until `entitled`
  // flips — a plan purchase never raises tokensRemaining.
  const pollForActivation = async () => {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      if (pollCancelledRef.current) return;
      try {
        const profile = await fetchUserProfile();
        if (profile.entitled) {
          applyProfile(profile);
          toast.success(`You're on the ${PLAN_LABEL[profile.plan ?? 'monthly']}`, {
            description: 'Unlimited analyses unlocked.',
          });
          return;
        }
      } catch {
        // Transient fetch failure — keep polling.
      }
    }
    if (pollCancelledRef.current) return;
    toast.info('Your plan is activating', {
      description: 'Payment went through — refresh in a moment if it has not appeared.',
    });
    void refreshTokens();
  };

  const handleUpgrade = async (planId: PlanId) => {
    track('nav_upgrade_confirmed_clicked', { plan: planId, source });

    // Defensive: upgrade surfaces are only shown to signed-in users today.
    if (!user) {
      toast.info('Sign in to upgrade');
      router.push('/login');
      return;
    }

    setPurchasing(true);
    try {
      const { url } = await createCheckout(planId);
      await openLemonCheckout(url, {
        onSuccess: () => {
          track('plan_purchase_completed', { plan: planId, source });
          toast.success('Payment received', { description: 'Activating your plan…' });
          void pollForActivation();
          onOpenChange(false);
        },
      });
    } catch (err) {
      track('plan_purchase_failed', {
        plan: planId,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error('Could not start checkout', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPurchasing(false);
    }
  };

  const handleManageSubscription = async () => {
    track('manage_subscription_clicked', { source });
    setPortalLoading(true);
    try {
      const { url } = await fetchPortalUrl();
      window.open(url, '_blank');
    } catch (err) {
      toast.error('Could not open the billing portal', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const selected = PLANS.find(p => p.id === selectedPlan) ?? PLANS[1];
  const isLifetime = selected.id === 'lifetime';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {entitled ? (
          // Edge case: dialog opened from a stale surface after activation —
          // never offer a second purchase on top of an active plan.
          <div className="mt-1 space-y-3">
            <p className="text-sm text-muted-foreground">
              You&apos;re on the <span className="font-medium text-foreground">{currentPlan ? PLAN_LABEL[currentPlan] : 'Pro plan'}</span> — unlimited analyses are already unlocked.
            </p>
            {hasSubscription && (
              <Button
                variant="outline"
                className="w-full"
                disabled={portalLoading}
                onClick={handleManageSubscription}
              >
                {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Manage subscription
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-1 space-y-4">
            {showInvitePanel && (
              <>
                <InviteFriendPanel source={source} />
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            {/* Feature highlights */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-3 text-center">
                <FileSearch className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground leading-snug">Unlimited<br />analyses</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-3 text-center">
                <Sparkles className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground leading-snug">Advanced<br />AI insights</p>
              </div>
            </div>

            {/* Plan options */}
            <div className="space-y-2">
              {PLANS.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => {
                    setSelectedPlan(plan.id);
                    track('nav_upgrade_plan_selected', { plan: plan.id, source });
                  }}
                  className={cn(
                    'w-full flex items-center justify-between rounded-lg border px-3.5 py-3 text-left transition-colors',
                    selectedPlan === plan.id
                      ? 'border-foreground bg-secondary'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                        selectedPlan === plan.id ? 'border-foreground' : 'border-muted-foreground/30'
                      )}
                    >
                      {selectedPlan === plan.id && <div className="h-2 w-2 rounded-full bg-foreground" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{plan.name}</span>
                        {plan.badge && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{plan.blurb}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {plan.priceLabel}
                    <span className="text-xs font-normal text-muted-foreground"> {plan.cadence}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Button
                className="w-full"
                disabled={purchasing}
                onClick={() => handleUpgrade(selected.id)}
              >
                {purchasing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLifetime ? 'Get lifetime access' : 'Upgrade to Tailor Pro'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {isLifetime ? 'One-time payment · No renewal' : 'Renews automatically · Cancel anytime'}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
