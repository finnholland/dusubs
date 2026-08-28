// @ts-check
/* global chrome, importScripts */
const browser = globalThis.browser ?? globalThis.chrome;

// Chrome MV3 service workers need importScripts() to load plain (non-module)
// sibling scripts; Firefox MV2 loads config.js/sync.js separately via the
// "scripts" array in manifest.firefox.json, so importScripts is unavailable
// there (and unnecessary — the manifest guarantees load order instead).
//
// If this throws, the whole service worker fails to load and NONE of the
// listeners below register — sync would then silently never run with no
// error visible anywhere except this console. Wrapped so that failure is at
// least logged instead of vanishing.
if (typeof importScripts === 'function') {
  try {
    importScripts('config.js', 'sync.js');
    console.log('[dusubs bg] config.js + sync.js loaded');
  } catch (err) {
    console.error('[dusubs bg] importScripts failed — sync is disabled', err);
  }
}

console.log('[dusubs bg] background.js executing, instance', Math.random().toString(36).slice(2, 8));

if (!globalThis.DUSUBS_SYNC) {
  console.error('[dusubs bg] DUSUBS_SYNC missing after load — sync.js did not initialize correctly');
}

const SYNC_ALARM = 'dusubs-sync';
let syncInFlight = false;
let syncQueued = false;

async function runSync() {
  if (!globalThis.DUSUBS_SYNC) { console.error('[dusubs bg] runSync: DUSUBS_SYNC unavailable, skipping'); return; }
  if (syncInFlight) { syncQueued = true; return; }
  syncInFlight = true;
  try {
    const { syncToken } = await browser.storage.local.get({ syncToken: null });
    console.log('[dusubs bg] runSync triggered, token present:', !!syncToken);
    if (syncToken) await globalThis.DUSUBS_SYNC.syncWords(syncToken);
  } catch (err) {
    console.error('[dusubs bg] runSync threw', err);
  } finally {
    syncInFlight = false;
    if (syncQueued) { syncQueued = false; runSync(); }
  }
}

// Sync shortly after startup, whenever the token or local words change
// (debounced against sync's own writes via the in-flight guard above), and
// periodically in the background (alarms survive service-worker suspension;
// setInterval does not — requires the "alarms" permission in the manifest).
runSync();
if (browser.alarms) {
  browser.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM) runSync();
  });
} else {
  console.error('[dusubs bg] browser.alarms unavailable — is the "alarms" permission missing from the manifest?');
}
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if ('syncToken' in changes || 'savedWords' in changes) {
    console.log('[dusubs bg] storage changed:', Object.keys(changes).join(', '));
    runSync();
  }
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