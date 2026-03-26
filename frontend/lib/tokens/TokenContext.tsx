'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchUserProfile } from '@/lib/api';

interface TokenContextValue {
  tokensRemaining: number;
  referralCode: string | null;
  refreshTokens: () => Promise<void>;
  setTokensRemaining: (tokens: number) => void;
}

const TokenContext = createContext<TokenContextValue | null>(null);

export function TokenProvider({
  isAuthenticated,
  children,
}: {
  isAuthenticated: boolean;
  children: ReactNode;
}) {
  const [tokensRemaining, setTokensRemaining] = useState(0);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  const refreshTokens = useCallback(async () => {
    try {
      const pendingRef =
        typeof window !== 'undefined' ? localStorage.getItem('pendingReferralCode') : null;

      const profile = await fetchUserProfile(pendingRef || undefined);
      setTokensRemaining(profile.tokensRemaining);

      if (profile.referralCode) {
        setReferralCode(profile.referralCode);
      }

      if (pendingRef) {
        localStorage.removeItem('pendingReferralCode');
      }
    } catch (err) {
      console.error('Failed to fetch token balance:', err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshTokens();
    } else {
      setTokensRemaining(0);
    }
  }, [isAuthenticated, refreshTokens]);

  return (
    <TokenContext.Provider value={{ tokensRemaining, referralCode, refreshTokens, setTokensRemaining }}>
      {children}
    </TokenContext.Provider>
  );
}

export function useTokens(): TokenContextValue {
  const ctx = useContext(TokenContext);
  if (!ctx) {
    throw new Error('useTokens must be used within a TokenProvider');
  }
  return ctx;
}
