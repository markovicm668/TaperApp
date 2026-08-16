'use client';

import { useState } from 'react';
import { Check, Copy, Gift, Share2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTokens } from '@/lib/tokens/TokenContext';
import { track } from '@/lib/analytics';

interface InviteFriendPanelProps {
  source: 'nav' | 'sidebar' | 'out_of_credits' | 'results_lock' | 'settings';
}

export function InviteFriendPanel({ source }: InviteFriendPanelProps) {
  const { referralCode } = useTokens();
  const [copied, setCopied] = useState(false);

  const referralLink = referralCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}?ref=${referralCode}`
    : '';

  const handleCopyReferralLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    track('nav_referral_link_copied', { source });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!referralCode) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="space-y-3">
          <li className="flex items-center gap-3 text-sm">
            <Share2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>Share your invite link</span>
          </li>
          <li className="flex items-center gap-3 text-sm">
            <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              Your friend gets <strong className="font-semibold">3 free credits</strong>
            </span>
          </li>
          <li className="flex items-center gap-3 text-sm">
            <Gift className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              You get <strong className="font-semibold">3 credits</strong> when they complete
              their first analysis
            </span>
          </li>
        </ul>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground font-mono">
          {referralLink}
        </div>
        <Button
          size="sm"
          className="w-full shrink-0 gap-1.5 sm:w-auto"
          onClick={handleCopyReferralLink}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
}
