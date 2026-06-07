// @ts-check
// Bridges window.postMessage from the web app to browser.storage.local.
// Runs as an ISOLATED content script on the web app origin.
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
    if (!word?.zh) return;
    const { savedWords } = await browser.storage.local.get({ savedWords: {} });
    savedWords[word.zh] = word;
    await browser.storage.local.set({ savedWords });
  }

  if (e.data.type === 'DUSUBS_DELETE_WORD') {
    const { zh } = e.data;
    if (!zh) return;
    const { savedWords } = await browser.storage.local.get({ savedWords: {} });
    delete savedWords[zh];
    await browser.storage.local.set({ savedWords });
  }
});
