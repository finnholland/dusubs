// @ts-check
/* global chrome, importScripts */
const browser = globalThis.browser ?? globalThis.chrome;

// Chrome MV3 service workers need importScripts() to load plain (non-module)
// sibling scripts; Firefox MV2 loads config.js/sync.js separately via the
// "scripts" array in manifest.firefox.json, so importScripts is unavailable
// there (and unnecessary — the manifest guarantees load order instead).
if (typeof importScripts === 'function') {
  importScripts('config.js', 'sync.js');
}

const SYNC_ALARM = 'dusubs-sync';
let syncInFlight = false;
let syncQueued = false;

async function runSync() {
  if (syncInFlight) { syncQueued = true; return; }
  syncInFlight = true;
  try {
    const { syncToken } = await browser.storage.local.get({ syncToken: null });
    if (syncToken) await globalThis.DUSUBS_SYNC.syncWords(syncToken);
  } finally {
    syncInFlight = false;
    if (syncQueued) { syncQueued = false; runSync(); }
  }
}

// Sync shortly after startup, whenever the token or local words change
// (debounced against sync's own writes via the in-flight guard above), and
// periodically in the background (alarms survive service-worker suspension;
// setInterval does not).
runSync();
browser.alarms?.create(SYNC_ALARM, { periodInMinutes: 5 });
browser.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) runSync();
});
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if ('syncToken' in changes || 'savedWords' in changes) runSync();
});

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
  // Word deleted in the popup — push the delete to Firestore immediately
  // rather than waiting for the next passive sync (which has no tombstone
  // tracking and would otherwise pull the word back down from the cloud).
  if (msg.type === 'dusubs-delete-word' && msg.token && msg.id) {
    globalThis.DUSUBS_SYNC.pushDeletedWord(msg.token, msg.id)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

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
      fetchAndForward(track1, 'top'),
      fetchAndForward(track2, 'bottom'),
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