// @ts-check
import {
  browser, CHANNEL, LOG, DEFAULTS,
  cfg, setCfg, patchCfg,
  cues, renderState, savedZh,
  lastTrackUrls, setLastTrackUrls,
  localTracks, setLocalTracks,
  trackManuallySet, setTrackManuallySet,
} from './content/state.js';
import { topBox, bottomBox } from './content/dom.js';
import { loadKuromoji, loadJaDict } from './content/lang.js';
import { applyStyle, parseCues } from './content/render.js';
import './content/tooltip.js';

// ── Settings ───────────────────────────────────────────────────────────────
browser.storage.local.get({ ...DEFAULTS, savedWords: {}, zhTrack: null, enTrack: null, zhColor: null, enColor: null }).then(s => {
  // One-time migration: zhTrack/enTrack/zhColor/enColor → track1/track2/track1Color/track2Color
  const migrate = {};
  if (s.zhTrack !== null && !s.track1) { s.track1 = s.zhTrack; migrate.track1 = s.zhTrack; }
  if (s.enTrack !== null && !s.track2) { s.track2 = s.enTrack; migrate.track2 = s.enTrack; }
  if (s.zhColor !== null && s.track1Color === DEFAULTS.track1Color) { s.track1Color = s.zhColor; migrate.track1Color = s.zhColor; }
  if (s.enColor !== null && s.track2Color === DEFAULTS.track2Color) { s.track2Color = s.enColor; migrate.track2Color = s.enColor; }
  if (Object.keys(migrate).length) browser.storage.local.set(migrate);
  setCfg({ ...s, track1: DEFAULTS.track1, track2: DEFAULTS.track2 });
  LOG('cfg:', JSON.stringify(cfg));
  applyStyle();
  for (const zh of Object.keys(s.savedWords || {})) savedZh.add(zh);
  if (cfg.learnMode === 'ja') { loadKuromoji(); loadJaDict(); }
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of Object.keys(DEFAULTS)) {
    if (key in changes) {
      if (key === 'track1' || key === 'track2') continue; // per-tab; changed only via set-track message
      patchCfg({ [key]: changes[key].newValue });
    }
  }
  if ('learnMode' in changes) {
    renderState.lastTop = ''; renderState.lastBottom = '';
    if (changes.learnMode.newValue === 'ja') { loadKuromoji(); loadJaDict(); }
  }
  applyStyle();

  if ('savedWords' in changes) {
    const oldKeys = new Set(Object.keys(changes.savedWords.oldValue || {}));
    const newKeys = new Set(Object.keys(changes.savedWords.newValue || {}));
    for (const zh of oldKeys) if (!newKeys.has(zh)) savedZh.delete(zh);
    for (const zh of newKeys) if (!oldKeys.has(zh)) savedZh.add(zh);
  }
});

// ── Navigation ─────────────────────────────────────────────────────────────
function clearForNavigation() {
  cues.top = []; cues.bottom = [];
  renderState.lastTop = ''; renderState.lastBottom = '';
  topBox.textContent = ''; bottomBox.textContent = '';
}

window.addEventListener('yt-navigate-start', () => {
  clearForNavigation();
  setLastTrackUrls(null);
  if (!trackManuallySet) { patchCfg({ track1: '', track2: '' }); }
});

// ── Track data from MAIN world ─────────────────────────────────────────────
window.addEventListener(CHANNEL, (e) => {
  if (document.hidden) return;
  const { type, payload } = e.detail || {};
  if (type !== 'tracks') return;
  const { videoId, tracks } = payload;
  LOG('tracks from main, videoId:', videoId, 'count:', tracks.length);
  clearForNavigation();
  setLocalTracks(tracks.map(t => ({ languageCode: t.code, name: t.name })));
  browser.storage.local.set({ availableTracks: localTracks }).catch(() => { });
  setLastTrackUrls(Object.fromEntries(tracks.map(t => [t.code, t.url])));
  if (!trackManuallySet) {
    const tlist = /** @type {{ code: string }[]} */ (tracks);
    const isReal = (/** @type {{ code: string }} */ t) => !t.code.includes('-x-ytbasr');
    if (!cfg.track1) patchCfg({ track1: tlist.find(t => isReal(t) && t.code.startsWith('zh'))?.code || tlist.find(t => isReal(t) && t.code.startsWith('ja'))?.code || '' });
    if (!cfg.track2) patchCfg({ track2: tlist.find(t => isReal(t) && t.code.startsWith('en'))?.code || '' });
  }
  fetchSubtitles(lastTrackUrls);
});

// ── Subtitle fetching ──────────────────────────────────────────────────────
/** @param {Record<string, string>} trackUrls */
function fetchSubtitles(trackUrls) {
  if (!cfg.track1 && !cfg.track2) return;
  let videoId = new URLSearchParams(location.search).get('v');
  if (!videoId) {
    const m = location.pathname.match(/\/(BV\w+|av\d+)/i);
    if (m) videoId = m[1];
  }
  if (!videoId) return;
  LOG('fetchSubtitles track1:', cfg.track1, 'track2:', cfg.track2);
  browser.runtime.sendMessage({
    type: 'fetch-subtitles', videoId,
    track1: cfg.track1, track2: cfg.track2, tracks: trackUrls,
  }).catch(err => LOG('fetch-subtitles failed:', err));
}

// ── Message listener ───────────────────────────────────────────────────────
browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'subtitle-url') {
    if (document.hidden) return;
    let slot = null;
    if (msg.lang === 'top' || msg.lang === 'bottom') {
      slot = msg.lang;
    } else {
      if (cfg.track1 && cfg.track1.startsWith(msg.lang)) slot = 'top';
      else if (cfg.track2 && cfg.track2.startsWith(msg.lang)) slot = 'bottom';
    }
    if (slot) parseCues(slot, msg.url);
  }
  if (msg.type === 'get-tab-config') {
    sendResponse({ track1: cfg.track1, track2: cfg.track2, learnMode: cfg.learnMode, availableTracks: localTracks });
    return true;
  }
  if (msg.type === 'set-track') {
    const t1 = msg.track1 ?? cfg.track1;
    const t2 = msg.track2 ?? cfg.track2;
    const changed = t1 !== cfg.track1 || t2 !== cfg.track2;
    patchCfg({ track1: t1, track2: t2 });
    setTrackManuallySet(true);
    if (changed) {
      cues.top = []; cues.bottom = [];
      renderState.lastTop = ''; renderState.lastBottom = '';
      if (lastTrackUrls) fetchSubtitles(lastTrackUrls);
    }
    sendResponse({ ok: true });
    return true;
  }
});

// ── Visibility change ──────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    renderState.lastTop = ''; renderState.lastBottom = '';
    topBox.textContent = ''; bottomBox.textContent = '';
  }
  if (!document.hidden && lastTrackUrls && (cfg.track1 || cfg.track2) && !cues.top.length && !cues.bottom.length) {
    fetchSubtitles(lastTrackUrls);
  }
});
