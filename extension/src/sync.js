// @ts-check
/* global chrome */
// Syncs browser.storage.local savedWords with Firestore via the REST API,
// using the pasted sync token as the users/{token}/words/* path segment.
// No Firebase Auth session exists here — the token itself is the capability
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

  /** Fetches every cloud word for a token. Returns null on network failure. */
  async function fetchAllCloudWords(token) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(token)}/words`;
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
  async function fetchChangedCloudWords(token, sinceMs) {
    // Per the Firestore REST API, runQuery's `parent` is the path segment
    // *before* the leaf collection, given as part of the URL itself — not a
    // field in the request body. https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(token)}:runQuery`;
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

  /** Upserts one word doc under users/{token}/words/{id}, stamping updatedAt. */
  async function pushWord(token, id, word) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(token)}/words/${encodeURIComponent(id)}`;
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

  async function deleteCloudWord(token, id) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(token)}/words/${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      log('deleteCloudWord', id, res.status);
      if (!res.ok) warn('deleteCloudWord failed', id, res.status, await res.text().catch(() => ''));
    } catch (err) {
      warn('deleteCloudWord threw', id, err);
    }
  }

  async function ensureAccountDoc(token) {
    const url = `${FIRESTORE_BASE_URL}/users/${encodeURIComponent(token)}/meta/account`;
    try {
      const res = await fetch(url);
      if (res.ok) { log('ensureAccountDoc: already exists', token); return; }
      const createRes = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { createdAt: { integerValue: String(Date.now()) } } }),
      });
      log('ensureAccountDoc: created', token, createRes.status);
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
   */
  async function syncWords(token) {
    if (!token) { log('syncWords: no token, skipping'); return; }
    const cycleStart = Date.now();
    log('syncWords: starting cycle for token', token);
    await ensureAccountDoc(token);

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
      ? await fetchAllCloudWords(token)
      : await fetchChangedCloudWords(token, lastSyncedAt);
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
        pushes.push(pushWord(token, id, local));
      } else {
        const localTs = localTimestamp(local);
        const cloudTs = localTimestamp(cloud);
        if (localTs >= cloudTs) {
          if (localTs > cloudTs) pushes.push(pushWord(token, id, local));
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

  async function pushDeletedWord(token, id) {
    if (!token) return;
    await deleteCloudWord(token, id);
  }

  globalThis.DUSUBS_SYNC = { syncWords, pushDeletedWord };
})();
