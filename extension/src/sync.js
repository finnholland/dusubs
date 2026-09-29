// @ts-check
/* global chrome */
// Syncs browser.storage.local savedWords with Firestore via the REST API,
// keyed by account uuid as the users/{uuid}/words/* path segment.
//
// The pasted/displayed "sync token" is actually two parts joined as
// `username-passphrase` (split on the single hyphen — neither half may
// contain one): `uuid` is the real capability — short, random, and the only
// thing that grants Firestore access — while `username` is a unique,
// renameable identifier and `passphrase` is the real second factor, both
// stored in meta/account. Resolving a pasted token runs a collection-group
// query over every users/*/meta/account doc for a `username` match, then
// checks the stored `passphrase` too, purely so a wrong/guessed passphrase
// can't be used to confirm whether some username exists (see resolveToken).
// Either half can be renamed in place (renameUsername/renamePassphrase)
// without changing the uuid or moving any word data.
// No Firebase Auth session exists here — the uuid itself is the capability
// (see firestore.rules at repo root). Runs in the background service worker
// so it keeps working even while the popup is closed.
//
// Plain (non-module) script — see config.js for why. Expects config.js to
// have run first and set globalThis.DUSUBS_CONFIG. Exposes its functions on
// globalThis.DUSUBS_SYNC for background.js to call.
(function () {
  const browser = globalThis.browser ?? globalThis.chrome;
  const { FIRESTORE_BASE_URL, SYNC_DEBUG } = globalThis.DUSUBS_CONFIG;

  function log(...args) {
    if (SYNC_DEBUG) console.log('[dusubs sync]', ...args);
  }
  function warn(...args) {
    console.warn('[dusubs sync]', ...args);
  }

  /** @param {Record<string, any>} word */
  function toFirestoreFields(word) {
    /** @param {any} v */
    const encode = (v) => {
      if (v === null || v === undefined) return { nullValue: null };
      if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      if (typeof v === 'boolean') return { booleanValue: v };
      return { stringValue: String(v) };
    };
    /** @type {Record<string, any>} */
    const fields = {};
    for (const [k, v] of Object.entries(word)) {
      if (k === 'id') continue;
      fields[k] = encode(v);
    }
    return fields;
  }

  /** @param {Record<string, any>} fields */
  function fromFirestoreFields(fields) {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(fields || {})) {
      if ('nullValue' in v) out[k] = null;
      else if ('integerValue' in v) out[k] = Number(v.integerValue);
      else if ('doubleValue' in v) out[k] = v.doubleValue;
      else if ('booleanValue' in v) out[k] = v.booleanValue;
      else if ('stringValue' in v) out[k] = v.stringValue;
    }
    return out;
  }

  /**
   * Splits a full pasted/displayed token "username-passphrase" on its one
   * hyphen — neither half may contain a hyphen of its own. Returns null if
   * there isn't exactly one.
   */
  function splitToken(fullToken) {
    const parts = fullToken.split('-');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { username: parts[0], passphrase: parts[1] };
  }

  /** Fetches every cloud word for an account. Returns null on network failure. */
  async function fetchAllCloudWords(uuid) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(uuid)}/words`;
    try {
      const res = await fetch(url);
      log('fetchAllCloudWords', res.status, url);
      if (!res.ok) {
        warn('fetchAllCloudWords failed', res.status, await res.text().catch(() => ''));
        return null;
      }
      const data = await res.json();
      /** @type {Record<string, any>} */
      const words = {};
      for (const doc of data.documents || []) {
        const id = doc.name.split('/').pop();
        words[id] = { id, ...fromFirestoreFields(doc.fields) };
      }
      log('fetchAllCloudWords got', Object.keys(words).length, 'words');
      return words;
    } catch (err) {
      warn('fetchAllCloudWords threw', err);
      return null;
    }
  }

  /**
   * Fetches only cloud words written since `sinceMs`, via a structured query
   * filtering on the `updatedAt` field every push sets. Avoids re-reading the
   * whole collection on every sync cycle. Returns null on network failure.
   */
  async function fetchChangedCloudWords(uuid, sinceMs) {
    // Per the Firestore REST API, runQuery's `parent` is the path segment
    // *before* the leaf collection, given as part of the URL itself — not a
    // field in the request body. https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(uuid)}:runQuery`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'words' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'updatedAt' },
            op: 'GREATER_THAN',
            value: { integerValue: String(sinceMs) },
          },
        },
      },
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      log('fetchChangedCloudWords', res.status, url, 'since', sinceMs);
      if (!res.ok) {
        warn('fetchChangedCloudWords failed', res.status, await res.text().catch(() => ''));
        return null;
      }
      const rows = await res.json();
      /** @type {Record<string, any>} */
      const words = {};
      for (const row of rows) {
        if (!row.document) continue;
        const id = row.document.name.split('/').pop();
        words[id] = { id, ...fromFirestoreFields(row.document.fields) };
      }
      log('fetchChangedCloudWords got', Object.keys(words).length, 'changed words');
      return words;
    } catch (err) {
      warn('fetchChangedCloudWords threw', err);
      return null;
    }
  }

  /** Upserts one word doc under users/{uuid}/words/{id}, stamping updatedAt. */
  async function pushWord(uuid, id, word) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(uuid)}/words/${encodeURIComponent(id)}`;
    const withStamp = { ...word, updatedAt: Date.now() };
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFirestoreFields(withStamp) }),
      });
      log('pushWord', id, res.status, url);
      if (!res.ok) {
        warn('pushWord failed', id, res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      warn('pushWord threw', id, err);
    }
  }

  async function deleteCloudWord(uuid, id) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(uuid)}/words/${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      log('deleteCloudWord', id, res.status);
      if (!res.ok) warn('deleteCloudWord failed', id, res.status, await res.text().catch(() => ''));
    } catch (err) {
      warn('deleteCloudWord threw', id, err);
    }
  }

  /**
   * True if users/{uuid}/meta/account already exists — i.e. someone (this
   * device or another) has already claimed this uuid. Used to detect
   * collisions when generating a fresh random uuid in the popup; failures
   * are treated as "unknown, assume free" (returns false) so a network
   * hiccup doesn't block Generate from producing anything.
   */
  async function accountExists(uuid) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(uuid)}/meta/account`;
    try {
      const res = await fetch(url);
      log('accountExists', uuid, res.status);
      return res.ok;
    } catch (err) {
      warn('accountExists threw', err);
      return false;
    }
  }

  /**
   * Runs the users/*/meta collection-group query for `username == username`
   * and returns the first matching account doc as { uuid, username,
   * passphrase }, or null if no match / on any failure. The uuid isn't a
   * field in the doc — it's recovered from the matched document's own path
   * (users/{uuid}/meta/account).
   */
  async function queryAccountByUsername(username) {
    const url = `${FIRESTORE_BASE_URL}:runQuery`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'meta', allDescendants: true }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'username' },
            op: 'EQUAL',
            value: { stringValue: username },
          },
        },
        limit: 1,
      },
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      log('queryAccountByUsername', username, res.status);
      if (!res.ok) {
        warn('queryAccountByUsername failed', res.status, await res.text().catch(() => ''));
        return null;
      }
      const rows = await res.json();
      const row = rows.find((r) => r.document);
      if (!row) return null;
      // .../users/{uuid}/meta/account
      const parts = row.document.name.split('/');
      const uuid = parts[parts.length - 3];
      const fields = fromFirestoreFields(row.document.fields);
      return { uuid, username: fields.username, passphrase: fields.passphrase };
    } catch (err) {
      warn('queryAccountByUsername threw', err);
      return null;
    }
  }

  /**
   * True if some account has already claimed `username`. Used to detect
   * collisions when generating a fresh username in the popup, and before
   * renaming to a new one. Failures are treated as "unknown, assume free"
   * so a network hiccup doesn't block Generate/rename entirely.
   */
  async function usernameExists(username) {
    try {
      return (await queryAccountByUsername(username)) !== null;
    } catch (err) {
      warn('usernameExists threw', err);
      return false;
    }
  }

  /**
   * Resolves a full pasted/displayed token ("username-passphrase") to its
   * account: looks the username up via the collection-group query, then
   * checks its stored passphrase matches the parsed one. This is a
   * capability check, not a lookup: a wrong guess at either half fails
   * identically (no confirm/deny oracle) since the query only ever returns
   * username matches, never anything keyed by passphrase.
   * Returns { uuid, username, passphrase } on success, null on any failure
   * (malformed token, username not found, or passphrase mismatch).
   */
  async function resolveToken(fullToken) {
    const parsed = splitToken(fullToken);
    if (!parsed) { log('resolveToken: malformed token', fullToken); return null; }
    const account = await queryAccountByUsername(parsed.username);
    if (!account) { log('resolveToken: username not found', parsed.username); return null; }
    if (account.passphrase !== parsed.passphrase) {
      log('resolveToken: passphrase mismatch for username', parsed.username);
      return null;
    }
    return account;
  }

  function randomUuid() {
    let s = '';
    for (let i = 0; i < 6; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  /**
   * Popup's Link button, with no separate Generate step anymore: resolves
   * `username-passphrase` against an existing account first (same check as
   * resolveToken — wrong passphrase on a real username still fails). If no
   * account has that username at all, claims it fresh — new random uuid,
   * account doc created with the typed username/passphrase — so typing your
   * own new pair and hitting Link both creates and links in one step.
   * Returns { uuid, username, passphrase, created } on success (created
   * indicates which branch ran), or { taken: true } if the username exists
   * but the passphrase didn't match (so it can't be silently claimed over),
   * or null on failure.
   */
  async function linkOrCreateAccount(username, passphrase) {
    const existing = await queryAccountByUsername(username);
    if (existing) {
      if (existing.passphrase !== passphrase) {
        log('linkOrCreateAccount: username taken, passphrase mismatch', username);
        return { taken: true };
      }
      return { ...existing, created: false };
    }
    let uuid = randomUuid();
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!(await accountExists(uuid))) break;
      uuid = randomUuid();
    }
    await ensureAccountDoc(uuid, username, passphrase);
    return { uuid, username, passphrase, created: true };
  }

  /**
   * Renames the passphrase on an existing account in place — uuid and all
   * word data are untouched, this only rewrites the meta/account.passphrase
   * field. Caller must already hold the current correct (uuid, oldPassphrase)
   * pair (i.e. have successfully resolved it) — this performs no check of
   * its own beyond that the account exists, since knowing the uuid is
   * already the full capability.
   */
  async function renamePassphrase(uuid, newPassphrase) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(uuid)}/meta/account?updateMask.fieldPaths=passphrase`;
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { passphrase: { stringValue: newPassphrase } } }),
      });
      log('renamePassphrase', uuid, res.status);
      return res.ok;
    } catch (err) {
      warn('renamePassphrase threw', err);
      return false;
    }
  }

  /**
   * Renames the username on an existing account in place — uuid, passphrase,
   * and all word data are untouched, this only rewrites
   * meta/account.username. Rejects (returns { ok: false, taken: true }) if
   * `newUsername` is already claimed by any account; caller must already
   * hold the current correct (uuid, ...) pair, since knowing the uuid is
   * already the full capability.
   */
  async function renameUsername(uuid, newUsername) {
    if (await usernameExists(newUsername)) return { ok: false, taken: true };
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(uuid)}/meta/account?updateMask.fieldPaths=username`;
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { username: { stringValue: newUsername } } }),
      });
      log('renameUsername', uuid, res.status);
      return { ok: res.ok, taken: false };
    } catch (err) {
      warn('renameUsername threw', err);
      return { ok: false, taken: false };
    }
  }

  /**
   * Creates users/{uuid}/meta/account with the given username/passphrase if
   * it doesn't already exist (idempotent PATCH-if-missing). Does NOT touch
   * an existing doc's fields — renaming goes through renameUsername /
   * renamePassphrase, not here, so a sync cycle never silently reverts a
   * rename made elsewhere.
   */
  async function ensureAccountDoc(uuid, username, passphrase) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(uuid)}/meta/account`;
    try {
      const res = await fetch(url);
      if (res.ok) { log('ensureAccountDoc: already exists', uuid); return; }
      const createRes = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            createdAt: { integerValue: String(Date.now()) },
            username: { stringValue: username ?? '' },
            passphrase: { stringValue: passphrase ?? '' },
          },
        }),
      });
      log('ensureAccountDoc: created', uuid, createRes.status);
      if (!createRes.ok) warn('ensureAccountDoc create failed', createRes.status, await createRes.text().catch(() => ''));
    } catch (err) {
      warn('ensureAccountDoc threw', err);
    }
  }

  function localTimestamp(word) {
    return word.lastReviewed ?? word.savedAt ?? 0;
  }

  /**
   * Two-way, last-write-wins sync keyed by word id (char/en, matching the
   * extension's local storage key).
   *
   * First-ever sync (no lastSyncedAt watermark) does a full collection read
   * to reconcile complete state. Every sync after that only pulls cloud
   * words changed since the watermark (via a structured query on the
   * `updatedAt` field stamped by pushWord) and only pushes local words newer
   * than the watermark — keeping steady-state reads/writes proportional to
   * what actually changed instead of the whole word list every cycle.
   *
   * Known limitation: no tombstones, so a word deleted on one side while
   * offline on the other will reappear on next sync rather than staying
   * deleted. Acceptable for v1 given the low write volume.
   *
   * `username`/`passphrase` are only used the first time this uuid is ever
   * synced (to create meta/account) — pass the locally-stored ones along.
   */
  async function syncWords(uuid, username, passphrase) {
    if (!uuid) { log('syncWords: no uuid, skipping'); return; }
    const cycleStart = Date.now();
    log('syncWords: starting cycle for uuid', uuid);
    await ensureAccountDoc(uuid, username, passphrase);

    const { savedWords = {}, lastSyncedAt = null } = await browser.storage.local.get({ savedWords: {}, lastSyncedAt: null });
    log('syncWords: local savedWords count', Object.keys(savedWords).length, 'lastSyncedAt', lastSyncedAt);

    // Backfill: words saved before savedAt was stamped at save-time would
    // otherwise never match Firestore's `orderBy('savedAt')` dashboard query
    // (Firestore excludes docs missing the ordered-on field entirely) —
    // treat them as saved now so they become visible on next push.
    let backfilled = false;
    for (const w of Object.values(savedWords)) {
      if (w.savedAt == null) { w.savedAt = Date.now(); backfilled = true; }
    }
    if (backfilled) await browser.storage.local.set({ savedWords });

    const cloudWords = lastSyncedAt === null
      ? await fetchAllCloudWords(uuid)
      : await fetchChangedCloudWords(uuid, lastSyncedAt);
    if (cloudWords === null) {
      warn('syncWords: cloud fetch failed, skipping this cycle (watermark unchanged)');
      return;
    }

    const merged = { ...savedWords };
    const pushes = [];
    const localWords = lastSyncedAt === null
      ? Object.entries(savedWords)
      : Object.entries(savedWords).filter(([, w]) => localTimestamp(w) > lastSyncedAt);
    log('syncWords: candidate local words to push', localWords.length);

    for (const [id, local] of localWords) {
      const cloud = cloudWords[id];
      if (!cloud) {
        pushes.push(pushWord(uuid, id, local));
      } else {
        const localTs = localTimestamp(local);
        const cloudTs = localTimestamp(cloud);
        if (localTs >= cloudTs) {
          if (localTs > cloudTs) pushes.push(pushWord(uuid, id, local));
        } else {
          merged[id] = cloud;
        }
      }
    }

    for (const [id, cloud] of Object.entries(cloudWords)) {
      if (!savedWords[id]) merged[id] = cloud;
    }

    await Promise.all(pushes);
    await browser.storage.local.set({ savedWords: merged, lastSyncedAt: cycleStart });
    log('syncWords: cycle done —', pushes.length, 'pushed,', Object.keys(merged).length, 'total words, new watermark', cycleStart);
  }

  async function pushDeletedWord(uuid, id) {
    if (!uuid) return;
    await deleteCloudWord(uuid, id);
  }

  globalThis.DUSUBS_SYNC = {
    syncWords, pushDeletedWord, accountExists, usernameExists,
    resolveToken, linkOrCreateAccount, renamePassphrase, renameUsername, splitToken,
  };
})();
