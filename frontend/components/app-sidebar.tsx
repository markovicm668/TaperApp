'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpCircle, BarChart3, Check, Copy, FileSearch, Gift, HelpCircle, History, Settings, Share2, Sparkles, UserPlus, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/useAuth';
import { useTokens } from '@/lib/tokens/TokenContext';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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

interface AppSidebarProps {
  onNavigate?: () => void;
  userName?: string;
  mode?: 'compact' | 'expanded';
  creditsRemaining?: number;
  isAuthenticated?: boolean;
  showExpandToggle?: boolean;
  onToggleExpand?: () => void;
}

const navItems = [
  { href: '/analyze', label: 'Analyze', icon: FileSearch },
  { href: '/results', label: 'Results', icon: BarChart3, requiresResults: true },
  // { href: '/history', label: 'History', icon: History },
  // { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/help', label: 'Help', icon: HelpCircle },
];

export function AppSidebar({
  onNavigate,
  userName,
  mode = 'compact',
  creditsRemaining = 0,
  isAuthenticated = true,
  showExpandToggle = false,
  onToggleExpand,
}: AppSidebarProps) {
  const pathname = usePathname();
  const hasResults = useHasResults();
  const isCompact = mode === 'compact';
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>('yearly');
  const { signOut } = useAuth();
  const { referralCode } = useTokens();

  const referralLink = referralCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}?ref=${referralCode}`
    : '';

  const plans = [
    { id: 'yearly' as const, name: 'Yearly', badge: '70% off', bestDeal: true, billed: '$36 billed upfront', price: '$3' },
    { id: 'monthly' as const, name: 'Monthly', badge: null, bestDeal: false, billed: '$9 billed monthly', price: '$9' },
  ];

  const handleCopyReferralLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const [homeItem, ...mainItems] = navItems;
  const initials =
    userName
      ?.split(' ')
      .filter(Boolean)
      .map(name => name[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'M';
  const compactCreditsValue = creditsRemaining > 999 ? '999+' : String(Math.max(0, creditsRemaining));
  const toggleLabel = isCompact ? 'Expand sidebar' : 'Collapse sidebar';

  const isActivePath = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

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

  const navButtonClass = (isActive: boolean, isDisabled: boolean) =>
    cn(
      isCompact
        ? 'h-10 w-10 rounded-xl p-0'
        : 'h-11 w-full justify-start rounded-xl px-2 text-sm font-medium',

      isActive
        ? cn(
            isCompact ? 'bg-secondary text-foreground' : 'bg-muted/90 text-foreground',
            isCompact
              ? 'shadow-[0_0.5px_0.5px_rgba(15,23,42,0.04)]'
              : 'shadow-[0_1px_1px_rgba(15,23,42,0.07)]'
          )
        : 'border border-transparent text-muted-foreground hover:bg-muted/75 hover:text-foreground',
      isDisabled && 'cursor-not-allowed opacity-55'
    );

  const renderNavButton = (item: (typeof navItems)[number]) => {
    const isActive = isActivePath(item.href);
    const isDisabled = Boolean(item.requiresResults) && !hasResults;
    const Icon = item.icon;
    const disabledHint = item.requiresResults ? 'Run an analysis first to view results' : 'Unavailable';

    const content = (
      <>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center')}>
          <Icon className={cn(isCompact ? 'h-5 w-5' : 'h-4 w-4')} />
        </span>
        {!isCompact && <span className="truncate">{item.label}</span>}
        {isCompact && <span className="sr-only">{item.label}</span>}
      </>
    );

    const button = isDisabled ? (
      <Button variant="quiet" className={navButtonClass(isActive, true)} disabled>
        <span className={cn('flex shrink-0 items-center justify-center', isCompact ? 'w-10' : 'w-10')}>
          <Icon className={cn(isCompact ? 'h-5 w-5' : 'h-4 w-4')} />
        </span>
        {!isCompact && <span>{item.label}</span>}
        {isCompact && <span className="sr-only">{item.label}</span>}
      </Button>
    ) : (
      <Button
        variant="quiet"
        className={navButtonClass(isActive, false)}
        asChild
        onClick={onNavigate}
      >
        <Link href={item.href} aria-label={item.label}>
          <span className={cn('flex shrink-0 items-center justify-center', isCompact ? 'w-10' : 'w-10')}>
            <Icon className={cn(isCompact ? 'h-5 w-5' : 'h-4 w-4')} />
          </span>
          {!isCompact && <span>{item.label}</span>}
          {isCompact && <span className="sr-only">{item.label}</span>}
        </Link>
      </Button>
    );

    if (!isCompact) return button;

    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>
          <div>{button}</div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{isDisabled ? disabledHint : item.label}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderSidebarToggle = (tooltipSide: 'right' | 'bottom' = 'right') => {
    if (!showExpandToggle) return null;

    const icon = <Zap className={cn(isCompact ? 'h-5 w-5' : 'h-4 w-4')} />;

    const content = isCompact ? (
      <>
        <span className="flex w-10 shrink-0 items-center justify-center">{icon}</span>
        <span className="sr-only">{toggleLabel}</span>
      </>
    ) : (
      <>
        <span className="flex w-10 shrink-0 items-center justify-center">{icon}</span>
        <span>{toggleLabel}</span>
      </>
    );

    const toggleButton = (
      <Button
        variant="quiet"
        type="button"
        className={cn(
          'rounded-xl border border-transparent text-muted-foreground hover:bg-muted/75 hover:text-foreground',
          isCompact ? 'h-10 w-10 p-0' : 'h-11 w-full justify-start px-2 text-sm font-medium'
        )}
        onClick={onToggleExpand}
        disabled={!onToggleExpand}
        aria-label={toggleLabel}
        aria-pressed={!isCompact}
      >
        {content}
      </Button>
    );

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {toggleButton}
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>
          <p>{toggleLabel}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderProfileMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {isCompact ? (
          <Button
            variant="ghost"
            className="relative h-11 w-11 rounded-full border border-border/80 bg-background/50 p-0 hover:border-border"
            aria-label="Profile menu"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback className="border border-border/80 bg-secondary text-secondary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        ) : (
          <Button
            variant="quiet"
            className="h-12 w-full justify-start gap-3 rounded-xl border border-border/75 bg-muted/55 px-3"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="border border-border/80 bg-background text-xs font-semibold text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-medium text-foreground">{userName || 'User'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {isAuthenticated ? 'Free Plan' : 'Guest'}
              </p>
            </div>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        align={isCompact ? 'start' : 'end'}
        side={isCompact ? 'right' : 'top'}
        forceMount
      >
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            <p className="font-medium">{userName || 'User'}</p>
            <p className="text-xs text-muted-foreground">{isAuthenticated ? 'Free Plan' : 'Guest'}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        {isAuthenticated ? (
          <>
            <DropdownMenuItem asChild>
              <a href="/settings" onClick={onNavigate}>
                Profile
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-muted-foreground"
              disabled={isSigningOut}
              onSelect={event => {
                event.preventDefault();
                void handleSignOut();
              }}
            >
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild>
            <a href="/login" onClick={onNavigate}>
              Sign in
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <TooltipProvider delayDuration={140}>
      <aside
        className={cn(
          'relative flex h-full flex-col border-r border-sidebar-border/85 bg-sidebar/94',
          isCompact ? 'w-[64px] items-center py-5' : 'w-full min-w-[260px] px-3 py-4'
        )}
      >
        {isCompact ? (
          <>
            <div className="flex flex-col items-center gap-4">
              {renderSidebarToggle()}
              {renderNavButton(homeItem)}
              <div className="h-px w-10 bg-border/75" />
            </div>

            <div className="mt-5 flex w-full flex-1 flex-col items-center">
              <nav className="space-y-3">
                {mainItems.map(item => (
                  <div key={item.href}>{renderNavButton(item)}</div>
                ))}
              </nav>

              <div className="mt-auto flex flex-col items-center gap-3 pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-border/80 bg-background/70 px-2 text-xs font-semibold text-foreground tabular-nums">
                      {compactCreditsValue}
                      <span className="sr-only">Credits remaining: {creditsRemaining}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Credits: {creditsRemaining}</p>
                  </TooltipContent>
                </Tooltip>
                {isAuthenticated && referralCode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-10 w-10 rounded-xl border border-border/80 bg-background/70 p-0"
                        onClick={handleCopyReferralLink}
                        aria-label="Copy referral link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>Copy referral link</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {renderProfileMenu()}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-[4.25rem] shrink-0 items-center px-1">
              <Link href="/" onClick={onNavigate} className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80">
                <span className="font-serif text-lg font-semibold tracking-tight">Tailor</span>
              </Link>
            </div>

            <nav className="space-y-2">
              {showExpandToggle ? <div>{renderSidebarToggle('bottom')}</div> : null}
              {navItems.map(item => (
                <div key={item.href}>{renderNavButton(item)}</div>
              ))}
            </nav>

            <div className="mt-auto border-t border-border/75 pt-4">
              <p className="px-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground">ACCOUNT</p>
              <div className="mt-2 space-y-2">
                <Badge
                  variant="outline"
                  className="flex h-10 w-full items-center justify-between rounded-xl border-border/80 bg-background/70 px-3 text-left"
                >
                  <span className="text-[11px] tracking-wide text-muted-foreground">Credits</span>
                  <span className="text-xs font-semibold text-foreground tabular-nums">
                    {creditsRemaining}
                  </span>
                </Badge>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex h-10 w-full items-center justify-between rounded-xl border-border/80 bg-background/70 px-3 text-left"
                    >
                      <span className="text-[11px] tracking-wide text-muted-foreground">Upgrade to Pro</span>
                      <ArrowUpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-base">Tailor Pro</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border bg-muted/50 px-3 py-3 text-center">
                        <FileSearch className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
                        <p className="text-xs leading-snug text-muted-foreground">Unlimited<br />analyses</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/50 px-3 py-3 text-center">
                        <Sparkles className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
                        <p className="text-xs leading-snug text-muted-foreground">Advanced<br />AI insights</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {plans.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => setSelectedPlan(plan.id)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg border px-3.5 py-3 text-left transition-colors',
                            selectedPlan === plan.id
                              ? 'border-foreground bg-secondary'
                              : 'border-border hover:bg-muted/50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                              selectedPlan === plan.id ? 'border-foreground' : 'border-muted-foreground/30'
                            )}>
                              {selectedPlan === plan.id && <div className="h-2 w-2 rounded-full bg-foreground" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">{plan.name}</span>
                                {plan.badge && (
                                  <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                    {plan.badge}
                                  </span>
                                )}
                                {plan.bestDeal && (
                                  <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
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
                      <Button className="w-full">Upgrade to Tailor Pro</Button>
                      <p className="text-center text-xs text-muted-foreground">Renews automatically · Cancel anytime</p>
                    </div>
                  </DialogContent>
                </Dialog>

                {isAuthenticated && referralCode && (
                  <Dialog onOpenChange={(open) => { if (!open) setCopied(false); }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex h-10 w-full items-center justify-between rounded-xl border-border/80 bg-background/70 px-3 text-left"
                      >
                        <span className="text-[11px] tracking-wide text-muted-foreground">Earn credits</span>
                        <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </DialogTrigger>
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
                        <div className="flex items-center gap-2">
                          <div className="flex-1 truncate rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
                            {referralLink}
                          </div>
                          <Button size="sm" className="shrink-0 gap-1.5" onClick={handleCopyReferralLink}>
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? 'Copied!' : 'Copy link'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {renderProfileMenu()}
              </div>
            </div>
          </>
        )}
      </aside>
    </TooltipProvider>
  );
}
