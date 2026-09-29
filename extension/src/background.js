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
    // syncToken here is the bare account uuid (the real capability), not the
    // full "username-passphrase" string shown/copied in the popup — see sync.js.
    const { syncToken, syncUsername, syncPassphrase } = await browser.storage.local.get({ syncToken: null, syncUsername: null, syncPassphrase: null });
    console.log('[dusubs bg] runSync triggered, uuid present:', !!syncToken);
    if (syncToken) await globalThis.DUSUBS_SYNC.syncWords(syncToken, syncUsername, syncPassphrase);
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
  // msg.uuid is the bare account uuid.
  if (msg.type === 'dusubs-delete-word' && msg.uuid && msg.id) {
    globalThis.DUSUBS_SYNC.pushDeletedWord(msg.uuid, msg.id)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // Web asked for an immediate sync (Settings' "Sync now" button). `msg.uuid`
  // is the bare account uuid, not the full displayed token. Defense in
  // depth: re-read our own stored uuid and only proceed if it matches what
  // the page claims — never sync to an account we don't ourselves hold.
  if (msg.type === 'dusubs-sync-now' && msg.uuid) {
    browser.storage.local.get({ syncToken: null }).then(({ syncToken }) => {
      if (syncToken === msg.uuid) runSync();
    });
    return false;
  }

  // Popup asking whether a freshly-generated random uuid collides with one
  // that's already in use (see popup.tsx generateSyncToken). Routed through
  // here rather than fetching Firestore directly from the popup so
  // config.js/sync.js stay the single place that knows the project id.
  if (msg.type === 'dusubs-check-uuid' && msg.uuid) {
    if (!globalThis.DUSUBS_SYNC) { sendResponse({ exists: false }); return false; }
    globalThis.DUSUBS_SYNC.accountExists(msg.uuid)
      .then((exists) => sendResponse({ exists }))
      .catch(() => sendResponse({ exists: false }));
    return true;
  }

  // Popup asking whether a candidate username is already taken by some
  // account (see popup.tsx generateSyncToken). Same routing rationale as
  // dusubs-check-uuid above.
  if (msg.type === 'dusubs-check-username' && msg.username) {
    if (!globalThis.DUSUBS_SYNC) { sendResponse({ exists: false }); return false; }
    globalThis.DUSUBS_SYNC.usernameExists(msg.username)
      .then((exists) => sendResponse({ exists }))
      .catch(() => sendResponse({ exists: false }));
    return true;
  }

  // Resolves a full pasted "username-passphrase" token, checking both parts
  // match what's stored in Firestore. Used by the popup's manual paste box
  // and can be reused by web via the bridge. See sync.js resolveToken.
  if (msg.type === 'dusubs-resolve-token' && msg.token) {
    if (!globalThis.DUSUBS_SYNC) { sendResponse({ result: null }); return false; }
    globalThis.DUSUBS_SYNC.resolveToken(msg.token)
      .then((result) => sendResponse({ result }))
      .catch(() => sendResponse({ result: null }));
    return true;
  }

  // Popup's Link button: resolves username+passphrase against an existing
  // account, or claims a brand-new one if the username isn't taken yet — see
  // sync.js linkOrCreateAccount. No separate Generate step; typing your own
  // new pair and hitting Link both creates and links in one action.
  if (msg.type === 'dusubs-link-or-create' && msg.username && msg.passphrase) {
    if (!globalThis.DUSUBS_SYNC) { sendResponse({ result: null }); return false; }
    globalThis.DUSUBS_SYNC.linkOrCreateAccount(msg.username, msg.passphrase)
      .then((result) => sendResponse({ result }))
      .catch(() => sendResponse({ result: null }));
    return true;
  }

  // Renames the passphrase on the account this extension currently holds.
  // Defense in depth, same pattern as dusubs-sync-now: only proceed if
  // msg.uuid matches our own stored uuid.
  if (msg.type === 'dusubs-rename-passphrase' && msg.uuid && msg.newPassphrase) {
    if (!globalThis.DUSUBS_SYNC) { sendResponse({ ok: false }); return false; }
    browser.storage.local.get({ syncToken: null }).then(async ({ syncToken }) => {
      if (syncToken !== msg.uuid) { sendResponse({ ok: false }); return; }
      const ok = await globalThis.DUSUBS_SYNC.renamePassphrase(msg.uuid, msg.newPassphrase);
      if (ok) await browser.storage.local.set({ syncPassphrase: msg.newPassphrase });
      sendResponse({ ok });
    });
    return true;
  }

  // Renames the username on the account this extension currently holds.
  // Same defense-in-depth pattern as dusubs-rename-passphrase. Distinguishes
  // "already taken" from other failures so the popup can show a specific
  // error message.
  if (msg.type === 'dusubs-rename-username' && msg.uuid && msg.newUsername) {
    if (!globalThis.DUSUBS_SYNC) { sendResponse({ ok: false, reason: 'error' }); return false; }
    browser.storage.local.get({ syncToken: null }).then(async ({ syncToken }) => {
      if (syncToken !== msg.uuid) { sendResponse({ ok: false, reason: 'error' }); return; }
      const { ok, taken } = await globalThis.DUSUBS_SYNC.renameUsername(msg.uuid, msg.newUsername);
      if (ok) await browser.storage.local.set({ syncUsername: msg.newUsername });
      sendResponse({ ok, reason: ok ? null : taken ? 'taken' : 'error' });
    });
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