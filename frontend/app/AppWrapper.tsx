'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { AppSidebar } from '@/components/app-sidebar';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { useAuth } from '@/lib/auth/useAuth';
import { ResumeProvider } from '@/lib/resume/ResumeProvider';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

function mapAuthUserToAppUser(params: { name: string; email: string }): User {
  return {
    id: params.email,
    name: params.name,
    email: params.email,
    creditsRemaining: 0,
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
  const { user, loading } = useAuth();
  const [desktopSidebarMode, setDesktopSidebarMode] = useState<'compact' | 'expanded'>('compact');

  const isLoginPage = pathname === '/login';
  const isPublicAnalyzePage = pathname === '/';

  useEffect(() => {
    if (loading) return;

    if (!user && !isLoginPage && !isPublicAnalyzePage) {
      router.replace('/login');
      return;
    }

    if (user && isLoginPage) {
      router.replace('/');
    }
  }, [isLoginPage, isPublicAnalyzePage, loading, router, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user && isLoginPage) {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  if (!user && !isPublicAnalyzePage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isLoginPage) {
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
      })
    : guestUser;
  const isDesktopSidebarExpanded = desktopSidebarMode === 'expanded';

  return (
    <>
      <div className="flex min-h-screen flex-col bg-background">
        <div className="lg:hidden">
          <AppHeader
            creditsRemaining={appUser.creditsRemaining}
            userName={appUser.name}
            isAuthenticated={Boolean(user)}
          />
        </div>

        <div
          className={cn(
            'hidden lg:block fixed inset-y-0 left-0 z-40',
            isDesktopSidebarExpanded ? 'w-[260px]' : 'w-[64px]'
          )}
        >
          <AppSidebar
            mode={desktopSidebarMode}
            userName={appUser.name}
            creditsRemaining={appUser.creditsRemaining}
            isAuthenticated={Boolean(user)}
            showExpandToggle
            onToggleExpand={() =>
              setDesktopSidebarMode(prev => (prev === 'compact' ? 'expanded' : 'compact'))
            }
          />
        </div>

        <div className={cn('flex flex-1', isDesktopSidebarExpanded ? 'lg:ml-[260px]' : 'lg:ml-[64px]')}>
          <main className="flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">{children}</div>
          </main>
        </div>
      </div>
      <Toaster />
    </>
  );
}

export default function AppWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ResumeProvider>
        <AuthShell>{children}</AuthShell>
      </ResumeProvider>
    </AuthProvider>
  );
}
