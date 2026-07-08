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
  getAdditionalUserInfo,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
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
import { detectInAppBrowser } from '@/lib/auth/detectInAppBrowser';
import { clearEmailForSignIn, saveEmailForSignIn } from '@/lib/auth/emailLink';

interface GetIdTokenOptions {
  forceRefresh?: boolean;
}

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<{ isNewUser: boolean }>;
  sendEmailSignInLink: (email: string) => Promise<void>;
  completeEmailLinkSignIn: (email: string) => Promise<{ isNewUser: boolean }>;
  isEmailLinkSignIn: () => boolean;
  signOut: () => Promise<void>;
  getIdToken: (options?: GetIdTokenOptions) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GOOGLE_PROVIDER = new GoogleAuthProvider();
GOOGLE_PROVIDER.setCustomParameters({ prompt: 'select_account' });

function firebaseNotConfiguredError(): Error {
  return new Error(
    `Firebase auth is not configured. Missing: ${getMissingFirebaseConfigKeys().join(', ')}. If you just updated .env.local, restart the Next.js dev server.`
  );
}

function isPopupBlockedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('popup-blocked') ||
    error.message.includes('popup_closed_by_user') ||
    error.message.includes('operation-not-supported-in-this-environment')
  );
}

export class InAppBrowserError extends Error {
  constructor() {
    super(
      'Google sign-in is not supported in this in-app browser. Please open this page in Safari or Chrome.'
    );
    this.name = 'InAppBrowserError';
  }
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
      throw firebaseNotConfiguredError();
    }

    if (detectInAppBrowser().isInAppBrowser) {
      throw new InAppBrowserError();
    }

    const auth = getFirebaseAuth();
    try {
      const credential = await signInWithPopup(auth, GOOGLE_PROVIDER);
      return { isNewUser: getAdditionalUserInfo(credential)?.isNewUser ?? false };
    } catch (error) {
      if (isPopupBlockedError(error)) {
        // signInWithRedirect fails on mobile Safari (iOS) due to storage
        // partitioning (ITP): sessionStorage is cleared between the redirect
        // and the return, so Firebase loses its state. Only use redirect on
        // desktop browsers where this is not an issue.
        const isMobileBrowser = /iPhone|iPad|iPod|Android/i.test(
          navigator.userAgent
        );
        if (isMobileBrowser) {
          throw error;
        }
        await signInWithRedirect(auth, GOOGLE_PROVIDER);
        return { isNewUser: false };
      }
      throw error;
    }
  }, [firebaseEnabled]);

  // Intentionally no in-app browser check on the email link flow: sending the
  // link is a plain request that works inside webviews, and the emailed link
  // opens in the user's default browser.
  const sendEmailSignInLink = useCallback(
    async (email: string) => {
      if (!firebaseEnabled) {
        throw firebaseNotConfiguredError();
      }

      const auth = getFirebaseAuth();
      await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      });
      saveEmailForSignIn(email);
    },
    [firebaseEnabled]
  );

  const completeEmailLinkSignIn = useCallback(
    async (email: string) => {
      if (!firebaseEnabled) {
        throw firebaseNotConfiguredError();
      }

      const auth = getFirebaseAuth();
      const credential = await signInWithEmailLink(auth, email, window.location.href);
      clearEmailForSignIn();
      return { isNewUser: getAdditionalUserInfo(credential)?.isNewUser ?? false };
    },
    [firebaseEnabled]
  );

  const isEmailLinkSignIn = useCallback(() => {
    if (typeof window === 'undefined' || !firebaseEnabled) return false;
    return isSignInWithEmailLink(getFirebaseAuth(), window.location.href);
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
      sendEmailSignInLink,
      completeEmailLinkSignIn,
      isEmailLinkSignIn,
      signOut,
      getIdToken,
    }),
    [
      user,
      loading,
      signInWithGoogle,
      sendEmailSignInLink,
      completeEmailLinkSignIn,
      isEmailLinkSignIn,
      signOut,
      getIdToken,
    ]
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
