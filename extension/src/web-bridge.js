// @ts-check
// Bridges window.postMessage from the web app to browser.storage.local.
// Runs as an ISOLATED content script on the web app origin.
/* global chrome */
const browser = globalThis.browser ?? globalThis.chrome;
console.log('[dusubs] web-bridge injected');

window.addEventListener('message', async (e) => {
  if (typeof e.data?.type !== 'string' || !e.data.type.startsWith('DUSUBS_')) return;

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
    await browser.storage.local.clear();
  }
});
