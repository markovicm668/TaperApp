'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  measurementId?: string;
}

const FIREBASE_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || '',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || '',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || '',
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || '',
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() || '',
} as const;

const REQUIRED_FIREBASE_ENV_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

export function getMissingFirebaseConfigKeys(): string[] {
  return REQUIRED_FIREBASE_ENV_KEYS.filter(name => !FIREBASE_ENV[name]);
}

export function hasFirebaseConfig(): boolean {
  return getMissingFirebaseConfigKeys().length === 0;
}

function getFirebaseConfig(): FirebaseConfig {
  const missing = getMissingFirebaseConfigKeys();
  if (missing.length > 0) {
    throw new Error(`Missing required Firebase config: ${missing[0]}`);
  }

  return {
    apiKey: FIREBASE_ENV.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: FIREBASE_ENV.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: FIREBASE_ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: FIREBASE_ENV.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: FIREBASE_ENV.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
  };
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  const config = getFirebaseConfig();
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(config);
  return cachedApp;
}

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseApp());
  return cachedAuth;
}
