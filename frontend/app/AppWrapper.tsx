'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { AppNavbar } from '@/components/app-navbar';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { useAuth } from '@/lib/auth/useAuth';
import { ResumeProvider } from '@/lib/resume/ResumeProvider';
import { TokenProvider, useTokens } from '@/lib/tokens/TokenContext';
import type { User } from '@/lib/types';

function mapAuthUserToAppUser(params: { name: string; email: string; creditsRemaining: number }): User {
  return {
    id: params.email,
    name: params.name,
    email: params.email,
    creditsRemaining: params.creditsRemaining,
    plan: 'free',
  };
}

const guestUser: User = {
  id: 'guest',
  name: 'Guest',
  email: 'guest@example.com',
  creditsRemaining: 0,
  plan: 'free',
};

function AuthShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const { tokensRemaining } = useTokens();

  const isLoginPage = pathname === '/login';
  const isLandingPage = pathname === '/';
  const isPublicPage = isLoginPage || isLandingPage || pathname === '/terms' || pathname === '/privacy';

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref && /^[A-Za-z0-9_-]{6,12}$/.test(ref)) {
      localStorage.setItem('pendingReferralCode', ref);
    }
  }, [searchParams]);

  useEffect(() => {
    if (loading) return;

    if (!user && !isPublicPage) {
      router.replace('/login');
      return;
    }

    if (user && isLoginPage) {
      router.replace('/analyze');
    }
  }, [isLoginPage, isPublicPage, loading, router, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Login page renders without shell
  if (isLoginPage) {
    if (!user) {
      return (
        <>
          {children}
          <Toaster />
        </>
      );
    }
    // Authenticated user on login → show spinner while redirecting
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Unauthenticated on protected pages → show spinner while redirecting
  if (!user && !isPublicPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const fallbackName = user?.email?.split('@')[0] || 'User';
  const appUser = user
    ? mapAuthUserToAppUser({
        name: user.displayName || fallbackName,
        email: user.email || 'unknown@example.com',
        creditsRemaining: tokensRemaining,
      })
    : guestUser;
  const isAuthed = Boolean(user);
  const isFullWidthPage = isLandingPage;

  return (
    <>
      <div className="flex min-h-screen flex-col bg-background">
        {/* Mobile: hamburger header (authenticated only) */}
        {isAuthed && (
          <div className="lg:hidden">
            <AppHeader
              creditsRemaining={appUser.creditsRemaining}
              userName={appUser.name}
              isAuthenticated={isAuthed}
            />
          </div>
        )}

        {/* Desktop: top navbar (always shown) */}
        <div className={isAuthed ? 'hidden lg:block' : ''}>
          <AppNavbar
            userName={appUser.name}
            creditsRemaining={appUser.creditsRemaining}
            isAuthenticated={isAuthed}
          />
        </div>

        <main className="flex-1 overflow-auto">
          {isFullWidthPage ? (
            children
          ) : (
            <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">{children}</div>
          )}
        </main>
      </div>
      <Toaster />
    </>
  );
}

function AppWrapperInner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <TokenProvider isAuthenticated={Boolean(user)}>
      <ResumeProvider>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-background">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          }
        >
          <AuthShell>{children}</AuthShell>
        </Suspense>
      </ResumeProvider>
    </TokenProvider>
  );
}

export default function AppWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppWrapperInner>{children}</AppWrapperInner>
    </AuthProvider>
  );
}
