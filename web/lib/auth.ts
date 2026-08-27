'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';

const STORAGE_KEY = 'dusubs_syncToken';

const TOKEN_WORDS = [
  'quiet', 'tiger', 'orbit', 'maple', 'river', 'ember', 'cloud', 'stone',
  'amber', 'birch', 'coral', 'delta', 'ferry', 'grove', 'haven', 'ivory',
  'jetty', 'karma', 'lemon', 'medal', 'noble', 'olive', 'pearl', 'quill',
  'raven', 'sable', 'tulip', 'urban', 'vapor', 'willow', 'xenon', 'yodel',
];

const TOKEN_PATTERN = /^[a-z]+(-[a-z]+)*$/;

export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token) && token.length >= 3 && token.length <= 64;
}

function randomToken(): string {
  const pick = () => TOKEN_WORDS[Math.floor(Math.random() * TOKEN_WORDS.length)];
  return `${pick()}-${pick()}-${pick()}`;
}

export function getLocalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function setLocalToken(token: string): void {
  window.localStorage.setItem(STORAGE_KEY, token);
}

/** True if `users/{token}/meta/account` already exists. */
async function tokenExists(token: string): Promise<boolean> {
  const snap = await getDoc(doc(getDb(), 'users', token, 'meta', 'account'));
  return snap.exists();
}

async function createAccountDoc(token: string): Promise<void> {
  await setDoc(doc(getDb(), 'users', token, 'meta', 'account'), { createdAt: Date.now() });
}

/**
 * Generates a fresh, unclaimed random token and creates its account doc.
 * Retries on the (rare) chance a randomly generated token is already taken.
 */
async function generateToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = randomToken();
    if (!(await tokenExists(token))) {
      await createAccountDoc(token);
      return token;
    }
  }
  throw new Error('Could not generate a unique sync token — please try again.');
}

/**
 * Links this browser to `token`. If the token has never been used before,
 * this claims it (creates its account doc); if it already exists — e.g.
 * pasted in from the extension or another device — this just adopts it
 * locally. Knowing the token is the only authorization check there is.
 */
export async function linkToken(token: string): Promise<void> {
  if (!isValidToken(token)) {
    throw new Error('Token must be lowercase words separated by hyphens.');
  }
  if (!(await tokenExists(token))) {
    await createAccountDoc(token);
  }
  setLocalToken(token);
}

/** Generates a brand-new random token, abandoning the old one's data. */
export async function regenerateSyncToken(): Promise<string> {
  const token = await generateToken();
  setLocalToken(token);
  return token;
}

/**
 * Returns this browser's sync token, generating one automatically on first
 * use. No sign-in step — the token itself is the only credential.
 */
export function useSyncToken() {
  // Lazy initializer reads localStorage synchronously up front, so the
  // effect below only has async work (and thus setState) to do when no
  // token exists yet — avoids a synchronous setState in the effect body.
  const [token, setToken] = useState<string | null>(() => getLocalToken());
  const [loading, setLoading] = useState(() => getLocalToken() === null);

  useEffect(() => {
    if (token) return;
    let cancelled = false;
    generateToken().then((t) => {
      if (cancelled) return;
      setLocalToken(t);
      setToken(t);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  return { token, loading };
}
