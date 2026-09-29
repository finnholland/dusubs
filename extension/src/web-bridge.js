// @ts-check
// Bridges window.postMessage from the web app to browser.storage.local.
// Runs as an ISOLATED content script on the web app origin.
/* global chrome */
const browser = globalThis.browser ?? globalThis.chrome;

console.log('[dusubs web-bridge] injected on', location.href);

window.addEventListener('message', async (e) => {
  if (typeof e.data?.type !== 'string' || !e.data.type.startsWith('DUSUBS_')) return;
  console.log('[dusubs web-bridge] received', e.data.type);

  if (e.data.type === 'DUSUBS_GET_WORDS') {
    try {
      const { savedWords } = await browser.storage.local.get({ savedWords: {} });
      window.postMessage({ type: 'DUSUBS_WORDS', words: Object.values(savedWords) }, '*');
    } catch (err) {
      window.postMessage({ type: 'DUSUBS_WORDS', words: [] }, '*');
    }
  }

  if (e.data.type === 'DUSUBS_SAVE_WORD') {
    const word = e.data.word;
    const wordKey = word?.char ?? word?.zh ?? word?.ja ?? word?.key;
    if (!wordKey) return;
    const { savedWords } = await browser.storage.local.get({ savedWords: {} });
    savedWords[wordKey] = {
      ...word,
      savedAt: word.savedAt ?? Date.now(),
      leitnerBox: word.leitnerBox ?? 1,
      lastReviewed: word.lastReviewed ?? null,
      nextReview: word.nextReview ?? null,
    };
    await browser.storage.local.set({ savedWords });
  }

  if (e.data.type === 'DUSUBS_UPDATE_WORD') {
    const { key, patch } = e.data;
    if (!key || !patch) return;
    const { savedWords } = await browser.storage.local.get({ savedWords: {} });
    if (!savedWords[key]) return;
    savedWords[key] = { ...savedWords[key], ...patch };
    await browser.storage.local.set({ savedWords });
  }

  if (e.data.type === 'DUSUBS_DELETE_WORD') {
    const key = e.data.key ?? e.data.char ?? e.data.zh;
    if (!key) return;
    const { savedWords } = await browser.storage.local.get({ savedWords: {} });
    delete savedWords[key];
    await browser.storage.local.set({ savedWords });
  }

  if (e.data.type === 'DUSUBS_DELETE_ALL_WORDS') {
    // Only clear saved words — storage.local.clear() would also wipe
    // settings and the sync token, silently unlinking the extension.
    await browser.storage.local.set({ savedWords: {} });
  }

  if (e.data.type === 'DUSUBS_GET_SYNC_TOKEN') {
    try {
      // syncToken in storage is the bare account uuid; reconstruct the full
      // "username-passphrase" string web actually links/displays/compares.
      const { syncToken, syncUsername, syncPassphrase } = await browser.storage.local.get({ syncToken: null, syncUsername: null, syncPassphrase: null });
      const token = syncToken && syncUsername && syncPassphrase ? `${syncUsername}-${syncPassphrase}` : null;
      window.postMessage({ type: 'DUSUBS_SYNC_TOKEN', token }, '*');
    } catch (err) {
      window.postMessage({ type: 'DUSUBS_SYNC_TOKEN', token: null }, '*');
    }
  }

  if (e.data.type === 'DUSUBS_SYNC_NOW') {
    // e.data.uuid is the bare account uuid the page already confirmed
    // matches the extension's own linked token (see DUSUBS_GET_SYNC_TOKEN).
    const uuid = e.data.uuid;
    if (!uuid) return;
    browser.runtime.sendMessage({ type: 'dusubs-sync-now', uuid });
  }
});
