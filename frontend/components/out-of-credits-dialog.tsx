'use client';

import { ShoppingCart } from 'lucide-react';
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

interface OutOfCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OutOfCreditsDialog({ open, onOpenChange }: OutOfCreditsDialogProps) {
  const handleBuyCreditsClick = () => {
    track('upsell_buy_credits_clicked', { source: 'out_of_credits_dialog' });
    toast.info('Credit purchases are launching soon', {
      description: 'Invite a friend above for free credits in the meantime.',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">You&apos;re out of credits</DialogTitle>
          <DialogDescription>
            Invite a friend to unlock more credits instantly, or check back soon for paid plans.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-1 space-y-4">
          <InviteFriendPanel source="out_of_credits_dialog" />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full justify-between" onClick={handleBuyCreditsClick}>
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Buy more credits
            </span>
            <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Coming soon
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
