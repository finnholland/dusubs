'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';

const STORAGE_KEY = 'dusubs_syncToken';
// Separate from STORAGE_KEY: a token is generated automatically for every
// browser on first visit (see useSyncToken) purely so Settings has something
// to show/copy. That auto-generated token must NOT make Dashboard/Study
// switch to querying Firestore — they'd hit a real but empty cloud account
// and report "no words" even though the extension has words locally. Only
// mark the token "linked" once the user has actually opted in: pasting it
// into the extension, saving/confirming it, or regenerating it in Settings.
const LINKED_KEY = 'dusubs_syncLinked';

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

export function isLinked(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(LINKED_KEY) === '1';
}

function markLinked(): void {
  window.localStorage.setItem(LINKED_KEY, '1');
}

/**
 * Marks the current (possibly still auto-generated) token as linked, without
 * changing it. Call this at the point the user takes the token somewhere
 * they'll use it for real — e.g. copying it to paste into the extension.
 */
export function markCurrentTokenLinked(): void {
  markLinked();
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
  markLinked();
}

/** Generates a brand-new random token, abandoning the old one's data. */
export async function regenerateSyncToken(): Promise<string> {
  const token = await generateToken();
  setLocalToken(token);
  markLinked();
  return token;
}

/**
 * Returns this browser's sync token, generating one automatically on first
 * use so Settings always has something to show/copy. No sign-in step — the
 * token itself is the only credential.
 *
 * `linked` is false until the user actually opts in (pasting the token into
 * the extension, saving it, or regenerating it via Settings). Callers that
 * decide where to read words from (Dashboard, Study) must pass `null` to
 * getWords() when `linked` is false, rather than the auto-generated token —
 * otherwise every fresh browser would silently query a real-but-empty
 * Firestore account instead of falling back to the extension's local words.
 */
export function useSyncToken() {
  // Lazy initializer reads localStorage synchronously up front, so the
  // effect below only has async work (and thus setState) to do when no
  // token exists yet — avoids a synchronous setState in the effect body.
  const [token, setToken] = useState<string | null>(() => getLocalToken());
  const [linked, setLinked] = useState(() => isLinked());
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

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LINKED_KEY) setLinked(isLinked());
      if (e.key === STORAGE_KEY) setToken(getLocalToken());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { token, linked, loading };
}
