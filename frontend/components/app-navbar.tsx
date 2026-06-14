'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, ArrowUpCircle, BarChart3, Check, Copy, FileSearch, Gift, HelpCircle, LayoutGrid, Plus, Settings, Share2, Sparkles, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { addCredits } from '@/lib/api';
import { useAuth } from '@/lib/auth/useAuth';
import { useTokens } from '@/lib/tokens/TokenContext';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useHasResults } from '@/lib/resume/selectors';
import { track } from '@/lib/analytics';
import { AdminOnly } from './admin-only';

function trackNavLinkClick(href: string) {
  switch (href) {
    case '/analyze':
      track('nav_analyze_clicked');
      break;
    case '/results':
      track('nav_results_clicked');
      break;
    case '/history':
      track('nav_history_clicked');
      break;
    case '/help':
      track('nav_help_clicked');
      break;
  }
}

interface AppNavbarProps {
  userName?: string;
  creditsRemaining?: number;
  isAuthenticated?: boolean;
}

const navItems = [
  { href: '/analyze', label: 'Analyze', icon: FileSearch },
  { href: '/results', label: 'Results', icon: BarChart3, requiresResults: true },
  { href: '/history', label: 'Tracker', icon: LayoutGrid },
  // { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/help', label: 'Help', icon: HelpCircle },
];

export function AppNavbar({
  userName,
  creditsRemaining = 0,
  isAuthenticated = true,
}: AppNavbarProps) {
  const pathname = usePathname();
  const hasResults = useHasResults();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>('yearly');

  const plans = [
    { id: 'yearly' as const, name: 'Yearly', badge: '70% off', bestDeal: true, billed: '$36 billed upfront', price: '$3' },
    { id: 'monthly' as const, name: 'Monthly', badge: null, bestDeal: false, billed: '$9 billed monthly', price: '$9' },
  ];
  const { signOut } = useAuth();
  const { referralCode, setTokensRemaining } = useTokens();

  const isActivePath = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  const referralLink = referralCode ? `${typeof window !== 'undefined' ? window.location.origin : ''}?ref=${referralCode}` : '';

  const handleCopyReferralLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    track('nav_referral_link_copied');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign out.';
      toast.error('Sign out failed', { description: message });
    } finally {
      setIsSigningOut(false);
    }
  };

  const initials =
    userName
      ?.split(' ')
      .filter(Boolean)
      .map((name) => name[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  return (
    <TooltipProvider delayDuration={140}>
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 lg:px-8 relative">
          {/* Left: Logo / Home */}
          <Link
            href="/"
            onClick={() => track('nav_logo_clicked')}
            className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
          >
            <span className="font-serif text-lg font-semibold tracking-tight">
              Tailor
            </span>
          </Link>

          {/* Center: Nav links (authenticated only) */}
          {isAuthenticated ? (
            <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = isActivePath(item.href);
                const isDisabled = Boolean(item.requiresResults) && !hasResults;
                const Icon = item.icon;

                if (isDisabled) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-muted-foreground/50 cursor-not-allowed"
                          disabled
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="text-[13px]">{item.label}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Run an analysis first to view results</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return (
                  <Button
                    key={item.href}
                    variant="ghost"
                    size="sm"
                    asChild
                    className={cn(
                      'gap-1.5 text-[13px]',
                      isActive
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Link href={item.href} onClick={() => trackNavLinkClick(item.href)}>
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>
          ) : null}

          {/* Right side */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <div className="flex h-8 items-center gap-1 rounded-lg border border-border/70 bg-muted/50 px-2.5 text-xs font-semibold tabular-nums text-foreground">
                  {creditsRemaining}
                  <span className="ml-0.5 font-normal text-muted-foreground">credits</span>
                  <AdminOnly>
                  {process.env.NEXT_PUBLIC_ENABLE_ADD_CREDITS === 'true' && (
                    <button
                      onClick={async () => {
                        try {
                          const { tokensRemaining: newBalance } = await addCredits();
                          setTokensRemaining(newBalance);
                          toast.success(`Added 100 credits (${newBalance} total)`);
                        } catch {
                          toast.error('Failed to add credits');
                        }
                      }}
                      className="ml-1 flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-white hover:bg-emerald-500"
                      title="DEV: Add 100 credits"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                  </AdminOnly>
                </div>

                {/* Upgrade to Pro */}
                <Dialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label="Upgrade to Pro"
                          onClick={() => track('nav_upgrade_clicked')}
                        >
                          <ArrowUpCircle className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent><p>Upgrade to Pro</p></TooltipContent>
                  </Tooltip>
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-base">Tailor Pro</DialogTitle>
                    </DialogHeader>

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

                    {/* Pricing options */}
                    <div className="space-y-2">
                      {plans.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => {
                            setSelectedPlan(plan.id);
                            track('nav_upgrade_plan_selected', { plan: plan.id });
                          }}
                          className={cn(
                            'w-full flex items-center justify-between rounded-lg border px-3.5 py-3 text-left transition-colors',
                            selectedPlan === plan.id
                              ? 'border-foreground bg-secondary'
                              : 'border-border hover:bg-muted/50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                              selectedPlan === plan.id ? 'border-foreground' : 'border-muted-foreground/30'
                            )}>
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
                                {plan.bestDeal && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                                    Best deal
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{plan.billed}</p>
                            </div>
                          </div>
                          <span className="text-sm font-semibold tabular-nums">
                            {plan.price}<span className="text-xs font-normal text-muted-foreground"> / mo</span>
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <Button
                        className="w-full"
                        onClick={() => track('nav_upgrade_confirmed_clicked', { plan: selectedPlan })}
                      >
                        Upgrade to Tailor Pro
                      </Button>
                      <p className="text-center text-xs text-muted-foreground">Renews automatically · Cancel anytime</p>
                    </div>
                  </DialogContent>
                </Dialog>

                {referralCode && (
                  <Dialog onOpenChange={(open) => { if (!open) setCopied(false); }}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label="Invite friends"
                            onClick={() => track('nav_invite_clicked')}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </DialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Invite friends</p>
                      </TooltipContent>
                    </Tooltip>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-base font-semibold">Invite a friend</DialogTitle>
                      </DialogHeader>
                      <div className="mt-1 space-y-4">
                        <div className="space-y-2.5">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">How it works</p>
                          <ul className="space-y-3">
                            <li className="flex items-center gap-3 text-sm">
                              <Share2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span>Share your invite link</span>
                            </li>
                            <li className="flex items-center gap-3 text-sm">
                              <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span>Your friend gets <strong className="font-semibold">3 free credits</strong></span>
                            </li>
                            <li className="flex items-center gap-3 text-sm">
                              <Gift className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span>You get <strong className="font-semibold">3 credits</strong> when they complete their first analysis</span>
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
                    </DialogContent>
                  </Dialog>
                )}

                <DropdownMenu
                  onOpenChange={(open) => {
                    if (open) track('nav_profile_menu_opened');
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="relative h-8 w-8 rounded-full p-0"
                      aria-label="Profile menu"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="border border-border/80 bg-secondary text-[10px] font-semibold text-secondary-foreground">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <div className="flex items-center gap-2 p-2">
                      <div className="flex flex-col space-y-1 leading-none">
                        <p className="font-medium">{userName || 'User'}</p>
                        <p className="text-xs text-muted-foreground">Free Plan</p>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link
                        href="/settings"
                        onClick={() => track('nav_profile_settings_clicked')}
                      >
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-muted-foreground"
                      disabled={isSigningOut}
                      onSelect={(event) => {
                        event.preventDefault();
                        track('nav_signout_clicked');
                        void handleSignOut();
                      }}
                    >
                      {isSigningOut ? 'Signing out...' : 'Sign out'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => track('nav_signin_clicked')}>
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/login" onClick={() => track('nav_get_started_clicked')}>
                  <Button size="sm" className="gap-1.5">
                    Get Started
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
