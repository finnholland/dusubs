'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getDb } from './firebase';

const STORAGE_KEY = 'dusubs_syncToken';
// Separate from STORAGE_KEY: web never mints a token itself (the extension
// does, via its popup's Generate button). A token only lands here once the
// user pastes it in and links it — `linked` tracks that opt-in so
// Dashboard/Study know when it's safe to query Firestore for it.
const LINKED_KEY = 'dusubs_syncLinked';

const TOKEN_PATTERN = /^[a-z]+(-[a-z]+)*$/;

export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token) && token.length >= 3 && token.length <= 64;
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
 * Marks the current token as linked, without changing it. Call this at the
 * point the user takes the token somewhere they'll use it for real.
 */
export function markCurrentTokenLinked(): void {
  markLinked();
}

/** True if `users/{token}/meta/account` already exists in Firestore. */
export async function tokenExists(token: string): Promise<boolean> {
  const snap = await getDoc(doc(getDb(), 'users', token, 'meta', 'account'));
  return snap.exists();
}

/**
 * Links this browser to `token` — a code the user already has (from the
 * extension's Generate button, or another linked device). Web never writes
 * an account doc to Firestore itself; it only checks whether one already
 * exists, so the caller can tell the user "found" vs. "not found yet"
 * (e.g. the extension hasn't completed its first sync). Links locally
 * either way — knowing the token is the only authorization check there is,
 * and a not-yet-synced code is still valid to wait on.
 */
export async function linkToken(token: string): Promise<{ found: boolean }> {
  if (!isValidToken(token)) {
    throw new Error('Token must be lowercase words separated by hyphens.');
  }
  const found = await tokenExists(token);
  setLocalToken(token);
  markLinked();
  return { found };
}

/** Unlinks this browser: clears the local token and linked flag. */
export function unlinkToken(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(LINKED_KEY);
}

/**
 * Returns this browser's sync token from localStorage, or null if none has
 * been linked yet. No sign-in step, no auto-generation — the token itself
 * is the only credential, and web only ever adopts one the user already has.
 *
 * `linked` is false until the user actually links a token via Settings.
 * Callers that decide where to read words from (Dashboard, Study) must pass
 * `null` to getWords() when `linked` is false, rather than the local token —
 * otherwise a token sitting unlinked in localStorage would silently query a
 * real-but-empty Firestore account instead of falling back to the
 * extension's local words.
 */
export function useSyncToken() {
  const [token, setToken] = useState<string | null>(() => getLocalToken());
  const [linked, setLinked] = useState(() => isLinked());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LINKED_KEY) setLinked(isLinked());
      if (e.key === STORAGE_KEY) setToken(getLocalToken());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // localStorage is read synchronously up front, so there's nothing async
  // to gate on — kept as `loading: false` so existing callers (Dashboard,
  // Study) that gate rendering on it don't need to change.
  return { token, linked, loading: false };
}
