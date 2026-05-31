(function () {
  'use strict';

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

  // ── Build overlay ──────────────────────────────────────────────────────────
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
  let cfg = { dualEnable: true, fontScale: 100, subPosition: 8 };
  browser.storage.local.get({ dualEnable: true, fontScale: 100, subPosition: 8 }).then(s => { cfg = s; applyVisibility(); });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('dualEnable' in changes) cfg.dualEnable = changes.dualEnable.newValue;
    if ('fontScale' in changes) cfg.fontScale = changes.fontScale.newValue;
    if ('subPosition' in changes) cfg.subPosition = changes.subPosition.newValue;
    applyVisibility();
    if ('zhTrack' in changes || 'enTrack' in changes) {
      cues.zh = []; cues.en = [];
      loadSubtitles();
    }
  });

  function applyVisibility() {
    enBox.style.display = cfg.dualEnable ? '' : 'none';
  }
  applyVisibility();

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isChinese(text) {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
  }

  function readText(selector) {
    return [...document.querySelectorAll(selector)]
      .map(el => el.textContent.trim())
      .filter(Boolean)
      .join(' ');
  }

  // ── Subtitle track cues (fetched directly from YouTube's timedtext API) ─────
  const cues = { zh: [], en: [] };

  async function fetchSubtitle(lang, url) {
    try {
      let text;
      if (url.startsWith('data:')) {
        const comma = url.indexOf(',');
        text = url.includes(';base64,') ? atob(url.slice(comma + 1)) : decodeURIComponent(url.slice(comma + 1));
      } else {
        const resp = await browser.runtime.sendMessage({ type: 'fetch-text', url });
        if (!resp?.ok) return;
        text = resp.text;
      }
      let parsed = [];
      try {
        // json3 format (used by YouTube for ASR/auto-generated and modern manual tracks)
        const data = JSON.parse(text);
        parsed = (data.events || [])
          .filter(e => e.segs)
          .map(e => ({
            start: e.tStartMs / 1000,
            end: (e.tStartMs + (e.dDurationMs || 0)) / 1000,
            text: e.segs.map(s => s.utf8 || '').join('').trim(),
          }))
          .filter(c => c.text);
      } catch (_) {
        // srv1 XML fallback: <transcript><text start dur>…</text></transcript>
        const doc = new DOMParser().parseFromString(text, 'text/xml');
        parsed = [...doc.querySelectorAll('text')].map(el => ({
          start: parseFloat(el.getAttribute('start')),
          end: parseFloat(el.getAttribute('start')) + parseFloat(el.getAttribute('dur') || 0),
          text: el.textContent.trim(),
        })).filter(c => c.text);
      }
      if (parsed.length) cues[lang] = parsed;
    } catch (_) { }
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'subtitle-url' && (msg.lang === 'zh' || msg.lang === 'en')) {
      fetchSubtitle(msg.lang, msg.url);
    }
  });

  // Parse captionTracks from YouTube's inline JSON embedded in the page HTML.
  // wrappedJSObject is unreliable because YouTube removes ytInitialPlayerResponse
  // from window after the player initialises. The embedded script tag is permanent.
  function getTracksFromPageData() {
    for (const script of document.querySelectorAll('script:not([src])')) {
      const text = script.textContent;
      const idx = text.indexOf('"captionTracks":');
      if (idx === -1) continue;
      const arrStart = text.indexOf('[', idx);
      if (arrStart === -1) continue;
      let depth = 0, i = arrStart;
      for (; i < text.length; i++) {
        if (text[i] === '[') depth++;
        else if (text[i] === ']') { if (--depth === 0) break; }
      }
      try { return JSON.parse(text.slice(arrStart, i + 1)); } catch (_) { }
    }
    return [];
  }

  async function loadSubtitles() {
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;

    // Get full track list; wrappedJSObject is the fast path, HTML parsing is the fallback.
    let tracks = [];
    try {
      tracks = window.wrappedJSObject?.ytInitialPlayerResponse
        ?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    } catch (_) { }
    if (!tracks.length) tracks = getTracksFromPageData();

    browser.storage.local.set({
      availableTracks: tracks.map(t => ({
        languageCode: t.languageCode,
        name: t.name?.simpleText || t.languageCode,
      })),
    });

    const sel = await browser.storage.local.get({ zhTrack: '', enTrack: '' });
    const zhTrack = tracks.find(t => t.languageCode === sel.zhTrack)
      || tracks.find(t => (t.languageCode || '').startsWith('zh'));
    const enTrack = tracks.find(t => t.languageCode === sel.enTrack)
      || tracks.find(t => (t.languageCode || '').startsWith('en'));

    const base = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&fmt=json3&lang=`;
    await Promise.all([
      zhTrack && fetchSubtitle('zh', zhTrack.baseUrl || base + encodeURIComponent(zhTrack.languageCode)),
      enTrack && fetchSubtitle('en', enTrack.baseUrl || base + encodeURIComponent(enTrack.languageCode)),
    ].filter(Boolean));
  }

  loadSubtitles();
  window.addEventListener('yt-navigate-finish', () => {
    cues.zh = []; cues.en = [];
    loadSubtitles();
  });

  let lastZh = '', lastEn = '';

  // ── Main loop ──────────────────────────────────────────────────────────────
  function tick() {
    attachOverlay();
    let zh = '', en = '';

    // Mirror YouTube's user-configured subtitle font size, then apply user scale.
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
    // The zh line-height (2.6) leaves ~1.1× the font size as dead space below the
    // visible glyph. Pull en up to close that gap.
    enBox.style.marginTop = -Math.round(zhSz * 1.1) + 'px';

    // YouTube: look up current subtitle cues by video time.
    // DOM scraping (.caption-window) won't work because YouTube only renders
    // one track at a time. We fetch both tracks directly via background.js.
    const video = document.querySelector('video');

    // Position overlay relative to the video frame, not the window.
    if (video) {
      const r = video.getBoundingClientRect();
      root.style.left = (r.left + r.width / 2) + 'px';
      root.style.bottom = (window.innerHeight - r.bottom + r.height * (cfg.subPosition || 8) / 100) + 'px';
      root.style.maxWidth = (r.width * 0.9) + 'px';
    }
    const t = video ? video.currentTime : -1;
    const findCue = (lang) => cues[lang].find(c => t >= c.start && t < c.end)?.text || '';
    zh = findCue('zh');
    en = findCue('en');

    // Bilibili fallback
    if (!zh) zh = readText('.bpx-player-subtitle-inner span, .bilibili-player-video-subtitle span');
    if (!en) en = readText('.bpx-player-subtitle-wrap > div:nth-child(2) .bpx-player-subtitle-inner span');

    if (zh !== lastZh) { lastZh = zh; zhBox.textContent = zh; }
    if (en !== lastEn) { lastEn = en; enBox.textContent = en; }
    zhBox.style.display = zh ? '' : 'none';
    enBox.style.display = (cfg.dualEnable && en) ? '' : 'none';
  }

  setInterval(tick, 80);

  // ── Hide the site's own subtitle layer once ours is working ───────────────
  let siteSubsHidden = false;
  function hideSiteSubs() {
    if (siteSubsHidden || !lastZh) return;
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