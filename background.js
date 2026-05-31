/**
 * background.js
 * Watches network requests for subtitle file URLs on YouTube and Bilibili,
 * then forwards them to the content script so it can fetch and parse them.
 */

const SUBTITLE_PATTERNS = [
  // YouTube timedtext API
  { urls: ['*://*.youtube.com/api/timedtext*'] },
  // Bilibili subtitle JSON
  { urls: ['*://*.bilivideo.com/*.json*', '*://*.bilibili.com/*/subtitle*'] },
];

function guessLang(url) {
  const m = url.match(/[?&]lang=([^&]+)/i)
    || url.match(/[?&]tlang=([^&]+)/i)
    || url.match(/_(zh|en|zh-Hans|zh-CN|zh-TW|zh-Hant)[\._]/i);
  if (!m) return 'unknown';
  const l = m[1].toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('en')) return 'en';
  return l;
}

// Content scripts can't fetch cross-origin URLs without CORS. They send the URL
// here and we fetch it from the background where host permissions apply.
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'fetch-text' && msg.url) {
    fetch(msg.url)
      .then(r => r.text())
      .then(text => sendResponse({ ok: true, text }))
      .catch(() => sendResponse({ ok: false, text: '' }));
    return true; // keep channel open for async response
  }
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId } = details;
    if (tabId < 0) return;
    const lang = guessLang(url);
    // Send the URL to the content script in that tab
    browser.tabs.sendMessage(tabId, { type: 'subtitle-url', url, lang })
      .catch(() => { }); // tab may not have content script yet — ignore
  },
  // Merge all URL patterns into one listener
  { urls: SUBTITLE_PATTERNS.flatMap(p => p.urls) }
);