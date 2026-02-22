'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  getFirebaseAuth,
  getMissingFirebaseConfigKeys,
  hasFirebaseConfig,
} from '@/lib/firebase/client';
import { configureApiAuth } from '@/lib/api';

interface GetIdTokenOptions {
  forceRefresh?: boolean;
}

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: (options?: GetIdTokenOptions) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GOOGLE_PROVIDER = new GoogleAuthProvider();
GOOGLE_PROVIDER.setCustomParameters({ prompt: 'select_account' });

function isPopupBlockedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('popup-blocked') ||
    error.message.includes('popup_closed_by_user') ||
    error.message.includes('operation-not-supported-in-this-environment')
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const firebaseEnabled = hasFirebaseConfig();

  const getIdToken = useCallback(
    async (options?: GetIdTokenOptions) => {
      if (!firebaseEnabled) return null;
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return null;
      return currentUser.getIdToken(options?.forceRefresh);
    },
    [firebaseEnabled]
  );

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseEnabled) {
      throw new Error(
        `Firebase auth is not configured. Missing: ${getMissingFirebaseConfigKeys().join(', ')}. If you just updated .env.local, restart the Next.js dev server.`
      );
    }

    const auth = getFirebaseAuth();
    try {
      await signInWithPopup(auth, GOOGLE_PROVIDER);
    } catch (error) {
      if (isPopupBlockedError(error)) {
        await signInWithRedirect(auth, GOOGLE_PROVIDER);
        return;
      }
      throw error;
    }
  }, [firebaseEnabled]);

  const signOut = useCallback(async () => {
    if (!firebaseEnabled) return;
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
  }, [firebaseEnabled]);

  useEffect(() => {
    if (!firebaseEnabled) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, nextUser => {
      setUser(nextUser);
      setLoading(false);
    });

    // Resolve redirect flow and surface any auth errors in the caller.
    getRedirectResult(auth).catch(error => {
      // eslint-disable-next-line no-console
      console.error('Firebase redirect sign-in failed:', error);
    });

    return unsubscribe;
  }, [firebaseEnabled]);

  useEffect(() => {
    if (!firebaseEnabled) {
      configureApiAuth({ tokenResolver: null, onAuthFailure: null });
      return;
    }

    configureApiAuth({
      tokenResolver: async options => getIdToken(options),
      onAuthFailure: async () => {
        await signOut();
      },
    });
    return () => {
      configureApiAuth({ tokenResolver: null, onAuthFailure: null });
    };
  }, [getIdToken, signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signInWithGoogle,
      signOut,
      getIdToken,
    }),
    [user, loading, signInWithGoogle, signOut, getIdToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
