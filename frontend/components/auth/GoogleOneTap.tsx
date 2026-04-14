'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: () => void;
          cancel: () => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

async function handleCredentialResponse(response: { credential: string }) {
  const auth = getFirebaseAuth();
  const firebaseCredential = GoogleAuthProvider.credential(response.credential);
  await signInWithCredential(auth, firebaseCredential);
}

function OneTapInitializer() {
  useEffect(() => {
    return () => {
      window.google?.accounts.id.cancel();
    };
  }, []);

  function onLoad() {
    window.google?.accounts.id.initialize({
      client_id: CLIENT_ID!,
      callback: handleCredentialResponse,
      auto_select: true,
      cancel_on_tap_outside: false,
    });
    window.google?.accounts.id.prompt();
  }

  return (
    <Script
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
      onLoad={onLoad}
    />
  );
}

export function GoogleOneTap() {
  if (!CLIENT_ID) return null;
  return <OneTapInitializer />;
}
