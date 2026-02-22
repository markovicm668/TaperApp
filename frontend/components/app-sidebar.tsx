'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BarChart3, FileSearch, HelpCircle, History, Settings, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/useAuth';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  { href: '/', label: 'Analyze', icon: FileSearch },
  { href: '/results', label: 'Results', icon: BarChart3, requiresResults: true },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
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
  const { signOut } = useAuth();
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

  const isActivePath = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

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
        : 'h-11 w-full justify-start gap-3 rounded-xl px-3 text-sm font-medium',

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

    const button = isDisabled ? (
      <Button variant="quiet" className={navButtonClass(isActive, true)} disabled>
        <Icon className={cn(isCompact ? 'h-5 w-5' : 'h-4 w-4')} />
        {!isCompact && item.label}
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
          <Icon className={cn(isCompact ? 'h-5 w-5' : 'h-4 w-4')} />
          {!isCompact && item.label}
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

    const toggleButton = (
      <Button
        variant="quiet"
        type="button"
        className={cn(
          'rounded-xl border border-transparent text-muted-foreground hover:bg-muted/75 hover:text-foreground',
          'h-10 w-10 p-0'
        )}
        onClick={onToggleExpand}
        disabled={!onToggleExpand}
        aria-label={toggleLabel}
        aria-pressed={!isCompact}
      >
        <Zap className={cn(isCompact ? 'h-5 w-5' : 'h-4 w-4')} />
        <span className="sr-only">{toggleLabel}</span>
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
          isCompact ? 'w-[64px] items-center py-5' : 'w-full min-w-[260px] p-4'
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
                {renderProfileMenu()}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 pb-4">
              <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">NAVIGATION</p>
              {showExpandToggle ? renderSidebarToggle('bottom') : null}
            </div>

            <nav className="space-y-2">
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
                {renderProfileMenu()}
              </div>
            </div>
          </>
        )}
      </aside>
    </TooltipProvider>
  );
}
