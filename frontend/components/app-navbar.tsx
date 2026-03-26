'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, BarChart3, Copy, FileSearch, HelpCircle, History, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/useAuth';
import { useTokens } from '@/lib/tokens/TokenContext';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

interface AppNavbarProps {
  userName?: string;
  creditsRemaining?: number;
  isAuthenticated?: boolean;
}

const navItems = [
  { href: '/analyze', label: 'Analyze', icon: FileSearch },
  { href: '/results', label: 'Results', icon: BarChart3, requiresResults: true },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
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
  const { signOut } = useAuth();
  const { referralCode } = useTokens();

  const isActivePath = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  const handleCopyReferralLink = () => {
    if (!referralCode) return;
    const link = `${window.location.origin}?ref=${referralCode}`;
    navigator.clipboard.writeText(link);
    toast.success('Referral link copied!', {
      description: 'Share it with friends to earn 25 credits when they complete their first analysis.',
    });
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
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 lg:px-8">
          {/* Left: Logo / Home */}
          <Link
            href="/"
            className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
          >
            <span className="font-serif text-lg font-semibold tracking-tight">
              ResumeTailor
            </span>
          </Link>

          {/* Center: Nav links (authenticated only) */}
          {isAuthenticated ? (
            <nav className="flex items-center gap-1">
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
                    <Link href={item.href}>
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>
          ) : (
            <div />
          )}

          {/* Right side */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <div className="flex h-8 items-center rounded-lg border border-border/70 bg-muted/50 px-2.5 text-xs font-semibold tabular-nums text-foreground">
                  {creditsRemaining}
                  <span className="ml-1 font-normal text-muted-foreground">credits</span>
                </div>

                {referralCode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={handleCopyReferralLink}
                        aria-label="Copy referral link"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Copy referral link</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                <DropdownMenu>
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
                      <Link href="/settings">Profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-muted-foreground"
                      disabled={isSigningOut}
                      onSelect={(event) => {
                        event.preventDefault();
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
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/login">
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
