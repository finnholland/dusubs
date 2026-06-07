// @ts-check

/**
 * @param {string} url
 * @returns {'zh' | 'en' | string}
 */
function guessLang(url) {
  const m = url.match(/[?&]lang=([^&]+)/i)
    || url.match(/[?&]tlang=([^&]+)/i);
  if (!m) return 'unknown';
  const l = m[1].toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('en')) return 'en';
  return l;
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
    const { videoId, zhTrack, enTrack, tracks } = msg;
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false }); return; }

    const fetchAndForward = async (langCode, slot) => {
      if (!langCode) return;
      const url = tracks?.[langCode];
      if (!url) {
        console.log(`[HPF bg] no URL for lang ${langCode} — available:`, Object.keys(tracks || {}));
        return;
      }
      console.log(`[HPF bg] fetching ${slot} (${langCode}):`, url.slice(0, 120));
      try {
        const r = await fetch(url);
        const text = await r.text();
        console.log(`[HPF bg] ${slot} status:`, r.status, 'length:', text.length);
        if (!r.ok || !text) return;
        browser.tabs.sendMessage(tabId, { type: 'subtitle-url', url, lang: slot }).catch(() => { });
      } catch (err) {
        console.log(`[HPF bg] ${slot} exception:`, err);
      }
    };

    Promise.all([
      fetchAndForward(zhTrack, 'zh'),
      fetchAndForward(enTrack, 'en'),
    ]).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});


// Passive intercept — still useful if CC is already on
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId } = details;
    if (tabId < 0) return;
    const lang = guessLang(url);
    if (lang === 'zh' || lang === 'en') {
      browser.tabs.sendMessage(tabId, { type: 'subtitle-url', url, lang }).catch(() => { });
    }
  },
  { urls: ['*://*.youtube.com/api/timedtext*', '*://*.bilivideo.com/*.json*'] }
);