'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchUserProfile, type PlanId, type UserProfile } from '@/lib/api';

interface TokenContextValue {
  tokensRemaining: number;
  tokensLoading: boolean;
  referralCode: string | null;
  plan: PlanId | null;
  entitled: boolean;
  planExpiresAt: string | null;
  hasSubscription: boolean;
  subscriptionStatus: string | null;
  refreshTokens: () => Promise<void>;
  setTokensRemaining: (tokens: number) => void;
  applyProfile: (profile: UserProfile) => void;
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
  const [tokensLoading, setTokensLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanId | null>(null);
  const [entitled, setEntitled] = useState(false);
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  const applyProfile = useCallback((profile: UserProfile) => {
    setTokensRemaining(profile.tokensRemaining);
    setPlan(profile.plan ?? null);
    setEntitled(Boolean(profile.entitled));
    setPlanExpiresAt(profile.planExpiresAt ?? null);
    setHasSubscription(Boolean(profile.hasSubscription));
    setSubscriptionStatus(profile.subscriptionStatus ?? null);
    if (profile.referralCode) {
      setReferralCode(profile.referralCode);
    }
  }, []);

  const refreshTokens = useCallback(async () => {
    try {
      const pendingRef =
        typeof window !== 'undefined' ? localStorage.getItem('pendingReferralCode') : null;

      const profile = await fetchUserProfile(pendingRef || undefined);
      applyProfile(profile);

      if (pendingRef) {
        localStorage.removeItem('pendingReferralCode');
      }
    } catch (err) {
      console.error('Failed to fetch token balance:', err);
    } finally {
      setTokensLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => {
    if (isAuthenticated) {
      setTokensLoading(true);
      refreshTokens();
    } else {
      setTokensRemaining(0);
      setPlan(null);
      setEntitled(false);
      setPlanExpiresAt(null);
      setHasSubscription(false);
      setSubscriptionStatus(null);
      setTokensLoading(false);
    }
  }, [isAuthenticated, refreshTokens]);

  return (
    <TokenContext.Provider
      value={{
        tokensRemaining,
        tokensLoading,
        referralCode,
        plan,
        entitled,
        planExpiresAt,
        hasSubscription,
        subscriptionStatus,
        refreshTokens,
        setTokensRemaining,
        applyProfile,
      }}
    >
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
