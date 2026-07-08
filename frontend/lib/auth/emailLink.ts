export const EMAIL_FOR_SIGN_IN_KEY = 'emailForSignIn';

// localStorage can throw (Safari private mode, disabled storage); sign-in must
// still work without it, so these helpers never throw.
export function saveEmailForSignIn(email: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email);
  } catch {
    // Ignore; the user will be asked to confirm their email on completion.
  }
}

export function readEmailForSignIn(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY);
  } catch {
    return null;
  }
}

export function clearEmailForSignIn(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
  } catch {
    // Ignore.
  }
}

const FIREBASE_ACTION_PARAMS = ['mode', 'oobCode', 'apiKey', 'continueUrl', 'lang'];

/**
 * Strips Firebase email-link action params from a URL so a refresh or back
 * navigation does not retry an already-consumed sign-in code. Returns a
 * relative URL (pathname + remaining search + hash) for history.replaceState.
 */
export function stripEmailLinkParams(href: string): string {
  try {
    const url = new URL(href);
    for (const param of FIREBASE_ACTION_PARAMS) {
      url.searchParams.delete(param);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}
