(function () {
  'use strict';

  const CHANNEL = 'hpf-main-isolated';
  const LOG = (...a) => console.log('[HPF]', ...a);

  const FONT_WOFF2 = browser.runtime.getURL('fonts/Hanzi-Pinyin-Font.top.woff2');
  const FONT_TTF = browser.runtime.getURL('fonts/Hanzi-Pinyin-Font.top.ttf');

  const styleEl = document.createElement('style');
  styleEl.textContent = `
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
      transform: translateX(-50%);
    }
    .hpf-box {
      width: max-content;
      max-width: 100%;
      text-align: center;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(styleEl);

  const root = document.createElement('div'); root.id = 'hpf-root';
  const zhBox = document.createElement('div'); zhBox.className = 'hpf-box';
  const enBox = document.createElement('div'); enBox.className = 'hpf-box';
  root.appendChild(zhBox);
  root.appendChild(enBox);

  function attachOverlay() {
    if (!document.body.contains(root)) document.body.appendChild(root);
  }
  if (document.body) attachOverlay();
  else document.addEventListener('DOMContentLoaded', attachOverlay);

  // ── Settings ───────────────────────────────────────────────────────────────
  const DEFAULTS = {
    fontScale: 100, subPosition: 8,
    zhTrack: '', enTrack: '',
    zhColor: '#ffffff', enColor: '#ffe97a',
    stroke: true, window: false, shadow: false,
  };

  let cfg = { ...DEFAULTS };

  browser.storage.local.get(DEFAULTS).then(s => {
    cfg = s;
    LOG('cfg:', JSON.stringify(cfg));
    applyStyle();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let trackChanged = false;
    for (const key of Object.keys(DEFAULTS)) {
      if (key in changes) cfg[key] = changes[key].newValue;
    }
    if ('zhTrack' in changes || 'enTrack' in changes) {
      cues.zh = []; cues.en = [];
      trackChanged = true;
    }
    applyStyle();
    if (trackChanged && lastTrackUrls) fetchSubtitles(lastTrackUrls);
  });

  // ── Apply styles ───────────────────────────────────────────────────────────
  function applyStyle() {
    const scale = (cfg.fontScale || 100) / 100;
    const sample = document.querySelector('.ytp-caption-window-container .ytp-caption-segment');
    let baseSz = 40;
    if (sample) { const sz = parseFloat(getComputedStyle(sample).fontSize); if (sz) baseSz = sz; }
    const zhSz = Math.round(baseSz * scale);
    const enSz = Math.round(zhSz * 0.6);

    const stroke = cfg.stroke ? '3px #000' : '0px #000';
    const shadow = cfg.shadow ? '0px 0px 6px rgba(0,0,0,1)' : 'none';
    const winBg = cfg.window ? 'background:rgba(0,0,0,0.5);padding:0 10px;border-radius:3px;' : '';

    zhBox.style.cssText = `
      font-family: 'HanziPinyin', sans-serif;
      font-size: ${zhSz}px;
      color: ${cfg.zhColor};
      line-height: 1.3;
      -webkit-text-stroke: ${stroke};
      paint-order: stroke fill;
      text-shadow: ${shadow};
      ${winBg}
    `;
    enBox.style.cssText = `
      font-family: Arial, sans-serif;
      font-size: ${enSz}px;
      color: ${cfg.enColor};
      line-height: 1.4;
      -webkit-text-stroke: ${stroke};
      paint-order: stroke fill;
      text-shadow: ${shadow};
      margin-top: 4px;
      ${winBg}
    `;

    root.style.display = (cfg.zhTrack || cfg.enTrack) ? '' : 'none';
    if (!cfg.zhTrack && !cfg.enTrack) showSiteSubs();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function readText(selector) {
    return [...document.querySelectorAll(selector)]
      .map(el => el.textContent.trim()).filter(Boolean).join(' ');
  }

  // ── Track data from MAIN world ─────────────────────────────────────────────
  let lastTrackUrls = null;

  window.addEventListener(CHANNEL, (e) => {
    const { type, payload } = e.detail || {};
    if (type !== 'tracks') return;
    const { videoId, tracks } = payload;
    LOG('tracks from main, videoId:', videoId, 'count:', tracks.length);
    cues.zh = []; cues.en = [];
    browser.storage.local.set({
      availableTracks: tracks.map(t => ({ languageCode: t.code, name: t.name })),
    }).catch(() => { });
    lastTrackUrls = Object.fromEntries(tracks.map(t => [t.code, t.url]));
    fetchSubtitles(lastTrackUrls);
  });

  // ── Subtitle fetching ──────────────────────────────────────────────────────
  function fetchSubtitles(trackUrls) {
    if (!cfg.zhTrack && !cfg.enTrack) return;
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;
    LOG('fetchSubtitles zh:', cfg.zhTrack, 'en:', cfg.enTrack);
    browser.runtime.sendMessage({
      type: 'fetch-subtitles', videoId,
      zhTrack: cfg.zhTrack, enTrack: cfg.enTrack, tracks: trackUrls,
    }).catch(err => LOG('fetch-subtitles failed:', err));
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'subtitle-url' && (msg.lang === 'zh' || msg.lang === 'en')) {
      parseCues(msg.lang, msg.url);
    }
  });

  // ── Cue parsing ────────────────────────────────────────────────────────────
  const cues = { zh: [], en: [] };

  async function parseCues(lang, url) {
    try {
      const resp = await browser.runtime.sendMessage({ type: 'fetch-text', url });
      if (!resp?.ok) return;
      let parsed = [];
      try {
        const data = JSON.parse(resp.text);
        parsed = (data.events || []).filter(e => e.segs).map(e => ({
          start: e.tStartMs / 1000,
          end: (e.tStartMs + (e.dDurationMs || 0)) / 1000,
          text: e.segs.map(s => s.utf8 || '').join('').trim(),
        })).filter(c => c.text);
      } catch (_) {
        const doc = new DOMParser().parseFromString(resp.text, 'text/xml');
        parsed = [...doc.querySelectorAll('text')].map(el => ({
          start: parseFloat(el.getAttribute('start')),
          end: parseFloat(el.getAttribute('start')) + parseFloat(el.getAttribute('dur') || 0),
          text: el.textContent.trim(),
        })).filter(c => c.text);
      }
      if (parsed.length) {
        cues[lang] = parsed;
        LOG(`parseCues(${lang}) ${parsed.length} cues, first:`, JSON.stringify(parsed[0]));
      } else {
        LOG(`parseCues(${lang}) 0 cues, preview:`, resp.text?.slice(0, 200));
      }
    } catch (err) {
      LOG(`parseCues(${lang}) exception:`, err);
    }
  }

  // ── Render loop ────────────────────────────────────────────────────────────
  let lastZh = '', lastEn = '', lastLogTime = -1;

  function tick() {
    attachOverlay();
    applyStyle();

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
    let en = cfg.enTrack ? findCue('en') : '';

    if (t > 0 && Math.floor(t) % 2 === 0 && Math.floor(t) !== lastLogTime) {
      lastLogTime = Math.floor(t);
      LOG(`t=${t.toFixed(1)}s zh=${cues.zh.length} en=${cues.en.length} | "${zh}" / "${en}"`);
    }

    if (cfg.zhTrack && !zh && !cues.zh.length) zh = readText('.bpx-player-subtitle-inner span, .bilibili-player-video-subtitle span');
    if (cfg.enTrack && !en && !cues.en.length) en = readText('.bpx-player-subtitle-wrap > div:nth-child(2) .bpx-player-subtitle-inner span');

    if (zh !== lastZh) { lastZh = zh; zhBox.textContent = zh; }
    if (en !== lastEn) { lastEn = en; enBox.textContent = en; }

    zhBox.style.display = zh ? '' : 'none';
    enBox.style.display = (cfg.enTrack && en) ? '' : 'none';
  }

  setInterval(tick, 80);

  // ── Hide YouTube's native subtitles once ours are showing ──────────────────
  let siteSubsHidden = false;
  let siteSubsStyleEl = null;

  function hideSiteSubs() {
    if (!cfg.zhTrack && !cfg.enTrack) return;
    if (siteSubsHidden || (!lastZh && !lastEn)) return;
    const hide = document.createElement('style');
    hide.textContent = `
      .ytp-caption-window-container { opacity: 0 !important; }
      .bpx-player-subtitle-wrap     { opacity: 0 !important; }
    `;
    document.head.appendChild(hide);
    siteSubsStyleEl = hide;
    siteSubsHidden = true;
  }

  function showSiteSubs() {
    if (siteSubsStyleEl) { siteSubsStyleEl.remove(); siteSubsStyleEl = null; }
    siteSubsHidden = false;
  }
  setTimeout(hideSiteSubs, 5000);
  setInterval(hideSiteSubs, 2000);

})();