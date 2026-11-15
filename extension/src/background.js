// @ts-check
/* global chrome */
const browser = globalThis.browser ?? globalThis.chrome;

/**
 * Base language code from a timedtext URL (?lang= or ?tlang=), e.g. 'es-419' → 'es'.
 * @param {string} url
 * @returns {string | null}
 */
function guessLang(url) {
  const m = url.match(/[?&]lang=([^&]+)/i) || url.match(/[?&]tlang=([^&]+)/i);
  return m ? m[1].toLowerCase().split(/[-_]/)[0] : null;
}

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Generic cross-origin fetch proxy
  if (msg.type === 'fetch-text' && msg.url) {
    fetch(msg.url)
      .then(r => r.text())
      .then(text => sendResponse({ ok: true, text }))
      .catch(() => sendResponse({ ok: false, text: '' }));
    return true;
  }

  // Proactive subtitle fetch — content.js sends the exact player URLs
  if (msg.type === 'fetch-subtitles') {
    const { videoId, track1, track2, tracks } = msg;
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false }); return; }

    const fetchAndForward = async (langCode, slot) => {
      if (!langCode) return;
      const url = tracks?.[langCode];
      if (!url) {
        console.log(`[dusubs bg] no URL for lang ${langCode} — available:`, Object.keys(tracks || {}));
        return;
      }
      console.log(`[dusubs bg] fetching ${slot} (${langCode}):`, url.slice(0, 120));
      try {
        const r = await fetch(url);
        const text = await r.text();
        console.log(`[dusubs bg] ${slot} status:`, r.status, 'length:', text.length);
        if (!r.ok || !text) return;
        browser.tabs.sendMessage(tabId, { type: 'subtitle-url', url, lang: slot }).catch(() => { });
      } catch (err) {
        console.log(`[dusubs bg] ${slot} exception:`, err);
      }
    };

    Promise.all([
      fetchAndForward(track1, 'top'),
      fetchAndForward(track2, 'bottom'),
    ]).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});


// Passive intercept — still useful if CC is already on; the content script ignores languages it isn't showing
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId } = details;
    if (tabId < 0) return;
    const lang = guessLang(url);
    if (lang) {
      browser.tabs.sendMessage(tabId, { type: 'subtitle-url', url, lang }).catch(() => { });
    }
  },
  { urls: ['*://*.youtube.com/api/timedtext*', '*://*.bilivideo.com/*.json*'] }
);