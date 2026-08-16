'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTokens } from '@/lib/tokens/TokenContext';
import { PLAN_LABEL } from '@/lib/billing';
import { fetchPortalUrl } from '@/lib/api';
import { track } from '@/lib/analytics';
import { UpgradePlansDialog } from '@/components/upgrade-plans-dialog';

function BillingCard() {
  const {
    tokensRemaining,
    plan,
    entitled,
    planExpiresAt,
    hasSubscription,
    subscriptionStatus,
  } = useTokens();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const handleManageSubscription = async () => {
    track('manage_subscription_clicked', { source: 'settings' });
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

  const expiryLabel = planExpiresAt
    ? new Date(planExpiresAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <Card className="border-border/80 bg-card/85">
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!entitled && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Free Plan</p>
                <p className="text-sm text-muted-foreground">{tokensRemaining} credits remaining</p>
              </div>
              <Button onClick={() => setUpgradeOpen(true)}>Upgrade</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Upgrade for unlimited analyses, saves, and downloads.
            </p>
          </>
        )}

        {entitled && plan === 'lifetime' && (
          <div>
            <p className="text-sm font-medium">{PLAN_LABEL.lifetime}</p>
            <p className="text-sm text-muted-foreground">
              Lifetime access — pay once, yours forever. Unlimited everything.
            </p>
          </div>
        )}

        {entitled && plan && plan !== 'lifetime' && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{PLAN_LABEL[plan]}</p>
              {expiryLabel && (
                <p className="text-sm text-muted-foreground">
                  {subscriptionStatus === 'cancelled' ? 'Access until' : 'Renews'} {expiryLabel}
                </p>
              )}
            </div>
            {hasSubscription && (
              <Button variant="outline" disabled={portalLoading} onClick={handleManageSubscription}>
                {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Manage subscription
              </Button>
            )}
          </div>
        )}
      </CardContent>
      <UpgradePlansDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} source="settings" />
    </Card>
  );
}

export default function SettingsPage() {
  // Mock state for settings
  const [strictAtsMode, setStrictAtsMode] = useState(true);
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">Preferences</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your application preferences and configuration.</p>
      </div>

      <BillingCard />

      <Card className="border-border/80 bg-card/85">
        <CardHeader>
          <CardTitle>Analysis Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="strict-ats-mode">Strict ATS Mode</Label>
            <Switch
              id="strict-ats-mode"
              checked={strictAtsMode}
              onCheckedChange={setStrictAtsMode}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Enabling this mode enforces stricter ATS compliance checks, prioritizing keyword exactness over semantic relevance.
          </p>
        </CardContent>
      </Card>
      
      <Card className="border-border/80 bg-card/85">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="notifications">Receive Email Notifications</Label>
            <Switch
              id="notifications"
              checked={notifications}
              onCheckedChange={setNotifications}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Get updates on new features, analysis completion, and credit low-balance warnings.
          </p>
        </CardContent>
      </Card>
      
      <div className="flex justify-end">
        <Button>Save Settings</Button>
      </div>
    </div>
  );
}
