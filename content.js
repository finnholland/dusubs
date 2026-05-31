/**
 * content.js  —  runs in ISOLATED world.
 *
 * Receives track data from youtube-main.js via CustomEvent, stores it,
 * renders the subtitle overlay, and coordinates with background.js for fetching.
 */
(function () {
  'use strict';

  const CHANNEL = 'hpf-main-isolated';
  const LOG = (...a) => console.log('[HPF]', ...a);

  // ── Fonts & overlay styles ─────────────────────────────────────────────────
  const FONT_WOFF2 = browser.runtime.getURL('fonts/Hanzi-Pinyin-Font.top.woff2');
  const FONT_TTF = browser.runtime.getURL('fonts/Hanzi-Pinyin-Font.top.ttf');

  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'HanziPinyin';
      src: url('${FONT_WOFF2}') format('woff2'),
           url('${FONT_TTF}') format('truetype');
    }
    #hpf-root {
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      transform: translateX(-50%);
    }
    .hpf-box {
      width: max-content;
      max-width: 100%;
      text-align: center;
      flex-shrink: 0;
    }
    .hpf-zh {
      font-family: 'HanziPinyin', sans-serif !important;
      font-size: var(--hpf-zh-size, 80px);
      color: #fff;
      line-height: 2.6;
      -webkit-text-stroke: 3px black;
      paint-order: stroke fill;
    }
    .hpf-en {
      font-family: Arial, sans-serif;
      font-size: var(--hpf-en-size, 44px);
      color: #ffe97a;
      line-height: 1.5;
      -webkit-text-stroke: 2px black;
      paint-order: stroke fill;
    }
  `;
  document.head.appendChild(style);

  // ── Overlay DOM ────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'hpf-root';
  const zhBox = document.createElement('div');
  zhBox.className = 'hpf-box hpf-zh';
  const enBox = document.createElement('div');
  enBox.className = 'hpf-box hpf-en';
  root.appendChild(zhBox);
  root.appendChild(enBox);

  function attachOverlay() {
    if (!document.body.contains(root)) document.body.appendChild(root);
  }
  if (document.body) attachOverlay();
  else document.addEventListener('DOMContentLoaded', attachOverlay);

  // ── Settings ───────────────────────────────────────────────────────────────
  let cfg = { dualEnable: true, fontScale: 100, subPosition: 8, zhTrack: '', enTrack: '' };

  browser.storage.local
    .get({ dualEnable: true, fontScale: 100, subPosition: 8, zhTrack: '', enTrack: '' })
    .then(s => { cfg = s; LOG('cfg loaded:', JSON.stringify(cfg)); applyVisibility(); });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let needReload = false;
    for (const key of ['dualEnable', 'fontScale', 'subPosition', 'zhTrack', 'enTrack']) {
      if (key in changes) cfg[key] = changes[key].newValue;
    }
    if ('zhTrack' in changes || 'enTrack' in changes) {
      LOG('track selection changed → zh:', cfg.zhTrack, 'en:', cfg.enTrack);
      cues.zh = []; cues.en = [];
      needReload = true;
    }
    applyVisibility();
    // If we already have trackUrls from the player, fetch immediately.
    if (needReload && lastTrackUrls) fetchSubtitles(lastTrackUrls);
  });

  function applyVisibility() {
    const zhOn = !!cfg.zhTrack;
    const enOn = !!cfg.enTrack && cfg.dualEnable;
    root.style.display = (zhOn || enOn) ? '' : 'none';
    enBox.style.display = enOn ? '' : 'none';
  }
  applyVisibility();

  // ── Track data from MAIN world ─────────────────────────────────────────────
  // { code → url } map of all available tracks for the current video.
  let lastTrackUrls = null;

  window.addEventListener(CHANNEL, (e) => {
    const { type, payload } = e.detail || {};
    if (type !== 'tracks') return;

    const { videoId, tracks } = payload;
    LOG('received tracks from main world, videoId:', videoId, 'count:', tracks.length);

    // Reset cues for the new video.
    cues.zh = []; cues.en = [];

    // Publish track list for the popup dropdowns.
    browser.storage.local.set({
      availableTracks: tracks.map(t => ({ languageCode: t.code, name: t.name })),
    }).catch(() => { });

    // Build code → url map and store for use when track selection changes.
    lastTrackUrls = Object.fromEntries(tracks.map(t => [t.code, t.url]));
    LOG('trackUrls keys:', Object.keys(lastTrackUrls).join(', '));

    // Fetch if tracks are already selected.
    fetchSubtitles(lastTrackUrls);
  });

  // ── Subtitle fetching ──────────────────────────────────────────────────────
  function fetchSubtitles(trackUrls) {
    if (!cfg.zhTrack && !cfg.enTrack) {
      LOG('fetchSubtitles: no tracks selected');
      return;
    }
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;

    LOG('fetchSubtitles → requesting background fetch, zh:', cfg.zhTrack, 'en:', cfg.enTrack);
    browser.runtime.sendMessage({
      type: 'fetch-subtitles',
      videoId,
      zhTrack: cfg.zhTrack,
      enTrack: cfg.enTrack,
      tracks: trackUrls,
    }).catch(err => LOG('fetch-subtitles failed:', err));
  }

  // background.js also forwards URLs it intercepts (e.g. when CC is already on).
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'subtitle-url' && (msg.lang === 'zh' || msg.lang === 'en')) {
      LOG('intercepted subtitle-url from bg, lang:', msg.lang);
      parseCues(msg.lang, msg.url);
    }
  });

  // ── Cue parsing ────────────────────────────────────────────────────────────
  const cues = { zh: [], en: [] };

  async function parseCues(lang, url) {
    LOG(`parseCues(${lang}) url:`, url.slice(0, 100));
    try {
      const resp = await browser.runtime.sendMessage({ type: 'fetch-text', url });
      if (!resp?.ok) { LOG(`parseCues(${lang}) fetch failed`); return; }

      let parsed = [];
      try {
        const data = JSON.parse(resp.text);
        parsed = (data.events || [])
          .filter(e => e.segs)
          .map(e => ({
            start: e.tStartMs / 1000,
            end: (e.tStartMs + (e.dDurationMs || 0)) / 1000,
            text: e.segs.map(s => s.utf8 || '').join('').trim(),
          }))
          .filter(c => c.text);
        LOG(`parseCues(${lang}) json3 cues:`, parsed.length);
      } catch (_) {
        const doc = new DOMParser().parseFromString(resp.text, 'text/xml');
        parsed = [...doc.querySelectorAll('text')].map(el => ({
          start: parseFloat(el.getAttribute('start')),
          end: parseFloat(el.getAttribute('start')) + parseFloat(el.getAttribute('dur') || 0),
          text: el.textContent.trim(),
        })).filter(c => c.text);
        LOG(`parseCues(${lang}) XML cues:`, parsed.length);
      }

      if (parsed.length) {
        cues[lang] = parsed;
        LOG(`parseCues(${lang}) ok, first:`, JSON.stringify(parsed[0]));
      } else {
        LOG(`parseCues(${lang}) 0 cues, preview:`, resp.text?.slice(0, 200));
      }
    } catch (err) {
      LOG(`parseCues(${lang}) exception:`, err);
    }
  }

  // ── Main render loop ───────────────────────────────────────────────────────
  let lastZh = '', lastEn = '', lastLogTime = -1;

  function tick() {
    attachOverlay();

    const sample = document.querySelector('.ytp-caption-window-container .ytp-caption-segment');
    let baseSz = 40;
    if (sample) {
      const sz = parseFloat(getComputedStyle(sample).fontSize);
      if (sz) baseSz = sz;
    }
    const scale = (cfg.fontScale || 100) / 100;
    const zhSz = Math.round(baseSz * scale);
    root.style.setProperty('--hpf-zh-size', zhSz + 'px');
    root.style.setProperty('--hpf-en-size', Math.round(zhSz * 0.6) + 'px');
    enBox.style.marginTop = -Math.round(zhSz * 1.1) + 'px';

    const video = document.querySelector('video');
    if (video) {
      const r = video.getBoundingClientRect();
      root.style.left = (r.left + r.width / 2) + 'px';
      root.style.bottom = (window.innerHeight - r.bottom + r.height * (cfg.subPosition || 8) / 100) + 'px';
      root.style.maxWidth = (r.width * 0.9) + 'px';
    }

    const t = video ? video.currentTime : -1;
    const findCue = (lang) => cues[lang].find(c => t >= c.start && t < c.end)?.text || '';

    let zh = cfg.zhTrack ? findCue('zh') : '';
    let en = (cfg.enTrack && cfg.dualEnable) ? findCue('en') : '';

    if (t > 0 && Math.floor(t) % 2 === 0 && Math.floor(t) !== lastLogTime) {
      lastLogTime = Math.floor(t);
      LOG(`t=${t.toFixed(1)}s zh=${cues.zh.length}cues en=${cues.en.length}cues | "${zh}" / "${en}"`);
    }

    // Bilibili fallback
    if (!zh && !cues.zh.length) zh = readText('.bpx-player-subtitle-inner span, .bilibili-player-video-subtitle span');
    if (!en && !cues.en.length) en = readText('.bpx-player-subtitle-wrap > div:nth-child(2) .bpx-player-subtitle-inner span');

    if (zh !== lastZh) { lastZh = zh; zhBox.textContent = zh; }
    if (en !== lastEn) { lastEn = en; enBox.textContent = en; }

    zhBox.style.display = zh ? '' : 'none';
    enBox.style.display = (cfg.dualEnable && en) ? '' : 'none';
  }

  function readText(selector) {
    return [...document.querySelectorAll(selector)]
      .map(el => el.textContent.trim()).filter(Boolean).join(' ');
  }

  setInterval(tick, 80);

  // ── Hide YouTube's native subtitle layer once ours is showing ──────────────
  let siteSubsHidden = false;
  function hideSiteSubs() {
    if (siteSubsHidden || (!lastZh && !lastEn)) return;
    const hide = document.createElement('style');
    hide.textContent = `
      .ytp-caption-window-container { opacity: 0 !important; }
      .bpx-player-subtitle-wrap     { opacity: 0 !important; }
    `;
    document.head.appendChild(hide);
    siteSubsHidden = true;
  }
  setTimeout(hideSiteSubs, 5000);
  setInterval(hideSiteSubs, 2000);

})();