'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { track } from '@/lib/analytics';
import { AppSidebar } from './app-sidebar';

interface AppHeaderProps {
  creditsRemaining: number;
  userName: string;
  isAuthenticated?: boolean;
}

export function AppHeader({ creditsRemaining, userName, isAuthenticated = true }: AppHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 flex h-[3.25rem] items-center gap-3 border-b border-border/75 bg-background/88 px-4 backdrop-blur-lg supports-[backdrop-filter]:bg-background/78">
      <div className="flex items-center gap-3">
        <Sheet
          open={mobileMenuOpen}
          onOpenChange={(open) => {
            if (open) track('nav_mobile_menu_opened');
            setMobileMenuOpen(open);
          }}
        >
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetTitle className="sr-only">Main navigation menu</SheetTitle>
            <AppSidebar
              mode="expanded"
              userName={userName}
              creditsRemaining={creditsRemaining}
              isAuthenticated={isAuthenticated}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-foreground">Tailor</p>
        </div>
      </div>
    </header>
  );
}
