'use client';

import { useEffect, useState } from 'react';
import { collectionGroup, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { getDb } from './firebase';

// A full sync token, as generated/displayed/pasted, is "username-passphrase"
// (split on the single hyphen — neither half may contain one). `uuid` is
// the real capability — short, random, never shown, and the only thing that
// grants Firestore access (see firestore.rules and extension/src/sync.js
// for the matching logic there). `username` is a unique, renameable
// identifier and `passphrase` is the real second factor, both stored
// alongside each other in meta/account. Resolving a token runs a
// collection-group query for a `username` match, then checks the stored
// `passphrase` too, purely so a guessed passphrase can't be used to confirm
// whether some username exists — there is no way to look accounts up by
// passphrase alone. Either half can be renamed in place without changing
// the uuid or moving any data.
//
// What's persisted locally is the resolved triple, not the full string —
// Dashboard/Study use the uuid directly as the users/{uuid}/... path
// segment, and username/passphrase are kept only for display/rename.
const UUID_KEY = 'dusubs_syncUuid';
const USERNAME_KEY = 'dusubs_syncUsername';
const PASSPHRASE_KEY = 'dusubs_syncPassphrase';
// Separate from the above: web never mints a token itself (the extension
// does, via its popup's Generate button). A token only lands here once the
// user pastes it in and links it — `linked` tracks that opt-in so
// Dashboard/Study know when it's safe to query Firestore for it.
const LINKED_KEY = 'dusubs_syncLinked';

const TOKEN_PATTERN = /^[a-z0-9]+-[a-z0-9]+$/;

export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token) && token.length >= 5 && token.length <= 80;
}

/** Splits a full token "username-passphrase" on its one hyphen. Null if malformed. */
export function splitToken(fullToken: string): { username: string; passphrase: string } | null {
  const parts = fullToken.split('-');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { username: parts[0], passphrase: parts[1] };
}

export function joinToken(username: string, passphrase: string): string {
  return `${username}-${passphrase}`;
}

/** The bare account uuid this browser is linked to — the real capability. */
export function getLocalUuid(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(UUID_KEY);
}

/** The unique username for the linked account, if known. */
export function getLocalUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(USERNAME_KEY);
}

/** The passphrase (real secret) for the linked account, if known. */
export function getLocalPassphrase(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PASSPHRASE_KEY);
}

function setLocal(uuid: string, username: string, passphrase: string): void {
  window.localStorage.setItem(UUID_KEY, uuid);
  window.localStorage.setItem(USERNAME_KEY, username);
  window.localStorage.setItem(PASSPHRASE_KEY, passphrase);
}

export function isLinked(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(LINKED_KEY) === '1';
}

function markLinked(): void {
  window.localStorage.setItem(LINKED_KEY, '1');
}

type Account = { uuid: string; username: string; passphrase: string };

/**
 * Runs the users/*\/meta collection-group query for `username == username`
 * and returns the first matching account, or null if no match. The uuid
 * isn't a field in the doc — it's recovered from the matched document's own
 * path (users/{uuid}/meta/account).
 */
async function queryAccountByUsername(username: string): Promise<Account | null> {
  const q = query(collectionGroup(getDb(), 'meta'), where('username', '==', username));
  const snap = await getDocs(q);
  const first = snap.docs[0];
  if (!first) return null;
  const data = first.data();
  const uuid = first.ref.parent.parent?.id;
  if (!uuid) return null;
  return {
    uuid,
    username: typeof data.username === 'string' ? data.username : '',
    passphrase: typeof data.passphrase === 'string' ? data.passphrase : '',
  };
}

/**
 * Resolves a full pasted token ("username-passphrase") against Firestore:
 * looks the username up via the collection-group query, then checks its
 * stored passphrase matches the parsed one. This is a capability check, not
 * a lookup — a wrong guess at either half fails identically (no confirm/
 * deny oracle) since the query only ever returns username matches, never
 * anything keyed by passphrase.
 */
export async function resolveToken(fullToken: string): Promise<Account | null> {
  const parsed = splitToken(fullToken);
  if (!parsed) return null;
  const account = await queryAccountByUsername(parsed.username);
  if (!account || account.passphrase !== parsed.passphrase) return null;
  return account;
}

/**
 * Links this browser to `fullToken` — a code the user already has (from the
 * extension's Generate button, or another linked device). Resolves it
 * against Firestore first: only a token whose username exists AND whose
 * passphrase matches links successfully. Returns `{ ok: false }` when the
 * code doesn't resolve — a malformed paste, or an account that doesn't
 * exist yet (e.g. the extension hasn't completed its first sync, since web
 * never creates account docs itself).
 */
export async function linkToken(fullToken: string): Promise<{ ok: boolean }> {
  if (!isValidToken(fullToken)) {
    throw new Error('Expected a code like finn123-quiettiger, copied from the extension.');
  }
  const resolved = await resolveToken(fullToken);
  if (!resolved) return { ok: false };
  setLocal(resolved.uuid, resolved.username, resolved.passphrase);
  markLinked();
  return { ok: true };
}

/**
 * Renames the username on the currently-linked account in place — the uuid
 * and all word data are untouched. Rejects with an error if `newUsername`
 * is already claimed by any account. Only possible once already linked
 * (i.e. already holding the correct uuid), since knowing the uuid is the
 * whole capability.
 */
export async function renameUsername(newUsername: string): Promise<void> {
  const uuid = getLocalUuid();
  const passphrase = getLocalPassphrase();
  if (!uuid || passphrase === null) throw new Error('Not linked.');
  const clean = newUsername.trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(clean)) {
    throw new Error('Lowercase letters and numbers only.');
  }
  const existing = await queryAccountByUsername(clean);
  if (existing) throw new Error('That username is already taken.');
  await updateDoc(doc(getDb(), 'users', uuid, 'meta', 'account'), { username: clean });
  setLocal(uuid, clean, passphrase);
}

/**
 * Renames the passphrase on the currently-linked account in place — the
 * uuid and all word data are untouched. Only possible once already linked
 * (i.e. already holding the correct uuid), since knowing the uuid is the
 * whole capability.
 */
export async function renamePassphrase(newPassphrase: string): Promise<void> {
  const uuid = getLocalUuid();
  const username = getLocalUsername();
  if (!uuid || username === null) throw new Error('Not linked.');
  const clean = newPassphrase.trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(clean)) {
    throw new Error('Lowercase letters and numbers only.');
  }
  await updateDoc(doc(getDb(), 'users', uuid, 'meta', 'account'), { passphrase: clean });
  setLocal(uuid, username, clean);
}

/** Unlinks this browser: clears the local uuid/username/passphrase and linked flag. */
export function unlinkToken(): void {
  window.localStorage.removeItem(UUID_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
  window.localStorage.removeItem(PASSPHRASE_KEY);
  window.localStorage.removeItem(LINKED_KEY);
}

/**
 * Returns this browser's linked account uuid from localStorage (the value
 * Dashboard/Study should use as the Firestore path segment), or null if
 * none has been linked yet. No sign-in step, no auto-generation — the uuid
 * itself is the only credential, and web only ever adopts one the user
 * already has (resolved via a full username-passphrase token, see
 * linkToken).
 *
 * `linked` is false until the user actually links a token via Settings.
 * Callers that decide where to read words from (Dashboard, Study) must pass
 * `null` to getWords() when `linked` is false, rather than the local uuid —
 * otherwise a uuid sitting unlinked in localStorage would silently query a
 * real-but-empty Firestore account instead of falling back to the
 * extension's local words.
 */
export function useSyncToken() {
  const [token, setToken] = useState<string | null>(() => getLocalUuid());
  const [username, setUsername] = useState<string | null>(() => getLocalUsername());
  const [passphrase, setPassphrase] = useState<string | null>(() => getLocalPassphrase());
  const [linked, setLinked] = useState(() => isLinked());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LINKED_KEY) setLinked(isLinked());
      if (e.key === UUID_KEY) setToken(getLocalUuid());
      if (e.key === USERNAME_KEY) setUsername(getLocalUsername());
      if (e.key === PASSPHRASE_KEY) setPassphrase(getLocalPassphrase());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // localStorage is read synchronously up front, so there's nothing async
  // to gate on — kept as `loading: false` so existing callers (Dashboard,
  // Study) that gate rendering on it don't need to change.
  return { token, username, passphrase, linked, loading: false };
}
