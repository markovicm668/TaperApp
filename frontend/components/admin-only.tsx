'use client';

import type { ReactNode } from 'react';
import { useAdmin } from '@/lib/auth/useAdmin';

export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdmin();
  if (!isAdmin) return null;
  return <>{children}</>;
}
