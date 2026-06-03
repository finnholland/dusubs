// @ts-check

/**
 * @typedef {{ fontScale: number, subPosition: number, zhTrack: string, enTrack: string,
 *             zhColor: string, enColor: string, stroke: boolean, window: boolean, shadow: boolean, showPinyin: boolean, toneSandhi: boolean }} Config
 * @typedef {{ start: number, end: number, text: string }} Cue
 */

(function () {
  'use strict';

  const CHANNEL = 'hpf-main-isolated';
  const LOG = (...a) => console.log('[HPF]', ...a);

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #hpf-root {
      position: absolute;
      z-index: 2147483647;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      left: 50%;
      transform: translateX(-50%);
      max-width: 90%;
    }
    .hpf-box {
      width: max-content;
      max-width: 100%;
      text-align: center;
      flex-shrink: 0;
      transition: opacity 0.15s ease;
    }
    .hpf-box ruby {
      letter-spacing: 0;
      margin-right: 0.15em;
      pointer-events: auto;
      cursor: default;
    }
    .hpf-box rt {
      font-family: Arial, sans-serif;
      font-size: 0.45em;
      line-height: 1.2;
      letter-spacing: 0;
    }
    #hpf-tooltip {
      position: fixed;
      z-index: 2147483647;
      background: rgba(10,10,10,0.85);
      backdrop-filter: blur(4px);
      color: #eee;
      border: 1px solid #44446a;
      border-radius: 8px;
      padding: 10px 14px;
      max-width: 320px;
      font-family: sans-serif;
      line-height: 1.4;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    #hpf-tooltip.hpf-tip-visible {
      opacity: 1;
      pointer-events: auto;
    }
    .hpf-tip-word { font-size: 28px; font-weight: normal; }
    .hpf-tip-pinyin { font-size: 16px; margin-top: 2px; }
    .hpf-tip-defs { font-size: 14px; color: #ccc; margin-top: 6px; }
    .hpf-tip-save {
      display: block;
      margin-top: 8px;
      padding: 4px 10px;
      font-size: 12px;
      background: rgba(255,255,255,0.1);
      border: 1px solid #44446a;
      border-radius: 4px;
      color: #eee;
      cursor: pointer;
      width: 100%;
      box-sizing: border-box;
    }
    .hpf-tip-save:hover { background: rgba(255,255,255,0.2); }
    .hpf-tip-save.saved { color: #7ef07e; border-color: #7ef07e; }
    .hpf-box rt { color: #fff; }
  `;
  document.head.appendChild(styleEl);

  const root = document.createElement('div'); root.id = 'hpf-root';
  const zhBox = document.createElement('div'); zhBox.className = 'hpf-box';
  const enBox = document.createElement('div'); enBox.className = 'hpf-box';
  root.appendChild(zhBox);
  root.appendChild(enBox);

  const tooltip = document.createElement('div'); tooltip.id = 'hpf-tooltip';

  // Player containers — overlay is appended here so scrolling is handled by the DOM
  const PLAYER_SEL = '.html5-video-player, .bpx-player-container';
  let overlayContainer = null;

  function attachOverlay() {
    const player = document.querySelector(PLAYER_SEL);
    const target = player || document.body;
    if (overlayContainer !== target || !target.contains(root)) {
      overlayContainer = target;
      target.appendChild(root);
      // Fall back to fixed positioning when we can't find a player container
      root.style.position = player ? 'absolute' : 'fixed';
    }
    if (!document.body.contains(tooltip)) document.body.appendChild(tooltip);
  }
  if (document.body) attachOverlay();
  else document.addEventListener('DOMContentLoaded', attachOverlay);

  // ── Settings ───────────────────────────────────────────────────────────────
  /** @type {Config} */
  const DEFAULTS = {
    fontScale: 100, subPosition: 8,
    zhTrack: '', enTrack: '',
    zhColor: '#ffffff', enColor: '#ffe97a',
    stroke: true, window: false, shadow: false, showPinyin: true, toneSandhi: true,
  };

  /** @type {Config} */
  let cfg = { ...DEFAULTS };

  /** @type {Set<string>} */
  const savedZh = new Set();

  browser.storage.local.get({ ...DEFAULTS, savedWords: {} }).then(s => {
    cfg = s;
    LOG('cfg:', JSON.stringify(cfg));
    applyStyle();
    for (const zh of Object.keys(s.savedWords || {})) savedZh.add(zh);
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

    if ('savedWords' in changes) {
      const oldKeys = new Set(Object.keys(changes.savedWords.oldValue || {}));
      const newKeys = new Set(Object.keys(changes.savedWords.newValue || {}));
      for (const zh of oldKeys) if (!newKeys.has(zh)) savedZh.delete(zh);
      for (const zh of newKeys) if (!oldKeys.has(zh)) savedZh.add(zh);

      const tipWord = tooltip.querySelector('.hpf-tip-word');
      const btn = tooltip.querySelector('.hpf-tip-save');
      if (tipWord && btn && tooltip.classList.contains('hpf-tip-visible')) {
        const zh = tipWord.textContent;
        const isSaved = savedZh.has(zh);
        btn.textContent = isSaved ? 'Saved ✓' : 'Save word';
        btn.classList.toggle('saved', isSaved);
      }
    }
  });

  // ── Apply styles ───────────────────────────────────────────────────────────
  function applyStyle() {
    const scale = (cfg.fontScale || 100) / 100;
    const sample = document.querySelector('.ytp-caption-window-container .ytp-caption-segment');
    let baseSz = 40;
    if (sample) { const sz = parseFloat(getComputedStyle(sample).fontSize); if (sz) baseSz = sz; }
    const zhSz = Math.round(baseSz * scale);
    const defaultSize = Math.round(zhSz * .8);

    const stroke = cfg.stroke ? '3px #000' : '0px #000';
    const shadow = cfg.shadow ? '0px 0px 6px rgba(0,0,0,1)' : 'none';
    const winBg = cfg.window ? 'background:rgba(0,0,0,0.5);padding:0 10px;border-radius:3px;' : '';

    const defaultBoxStyle = `
      font-family: Arial, sans-serif;
      line-height: 1.4;
      -webkit-text-stroke: ${stroke};
      paint-order: stroke fill;
      text-shadow: ${shadow};
      ${winBg}
    `;
    // Chinese-specific kerning — only applied when the track is actually Chinese
    const zhKerning = `
      font-family: sans-serif;
      letter-spacing: ${cfg.showPinyin ? '0' : '.15em'};
      line-height: 'normal';
      font-size: ${zhSz}px; 
    `;

    const zhTrackIsChinese = /^zh/i.test(cfg.zhTrack || '');
    const enTrackIsChinese = /^zh/i.test(cfg.enTrack || '');

    zhBox.style.cssText = defaultBoxStyle + `font-size: ${zhTrackIsChinese ? zhSz : defaultSize}px; color: ${cfg.zhColor};` + (zhTrackIsChinese ? zhKerning : '');
    enBox.style.cssText = defaultBoxStyle + `font-size: ${defaultSize}px; color: ${cfg.enColor}; margin-top: 4px;` + (enTrackIsChinese ? zhKerning : '');

    root.style.display = (cfg.zhTrack || cfg.enTrack) ? '' : 'none';
    if (!cfg.zhTrack && !cfg.enTrack) showSiteSubs();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function readText(selector) {
    return [...document.querySelectorAll(selector)]
      .map(el => el.textContent.trim()).filter(Boolean).join(' ');
  }

  // ── Dictionary ─────────────────────────────────────────────────────────────
  /** @type {Record<string, [string, string]> | null} */
  let hpfDict = null;
  let dictLoading = false;

  async function loadDict() {
    if (hpfDict || dictLoading) return;
    dictLoading = true;
    try {
      const resp = await fetch(browser.runtime.getURL('cedict.json'));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      hpfDict = await resp.json();
      LOG('dict loaded:', Object.keys(hpfDict).length, 'entries');
    } catch (e) {
      LOG('dict load failed:', e);
      dictLoading = false;
    }
  }

  /** @param {string} text @param {number} idx */
  function lookupWord(text, idx) {
    if (!hpfDict) return null;
    const chars = [...text];
    for (let len = Math.min(8, chars.length - idx); len >= 1; len--) {
      const word = chars.slice(idx, idx + len).join('');
      const entry = hpfDict[word];
      if (entry) return { word, pinyin: entry[0], defs: entry[1] };
    }
    return null;
  }

  // ── Tone sandhi helpers ────────────────────────────────────────────────────
  /** Returns the tone number (1-5) of a pinyin syllable based on its diacritic mark. */
  function pinyinTone(py) {
    if (/[āēīōūǖ]/.test(py)) return 1;
    if (/[áéíóúǘ]/.test(py)) return 2;
    if (/[ǎěǐǒǔǚ]/.test(py)) return 3;
    if (/[àèìòùǜ]/.test(py)) return 4;
    return 5;
  }

  const T3_TO_T2 = { 'ǎ': 'á', 'ě': 'é', 'ǐ': 'í', 'ǒ': 'ó', 'ǔ': 'ú', 'ǚ': 'ǘ' };
  const T1_TO_T2 = { 'ā': 'á', 'ē': 'é', 'ī': 'í', 'ō': 'ó', 'ū': 'ú', 'ǖ': 'ǘ' };
  const T1_TO_T4 = { 'ā': 'à', 'ē': 'è', 'ī': 'ì', 'ō': 'ò', 'ū': 'ù', 'ǖ': 'ǜ' };
  const T4_TO_T2 = { 'à': 'á', 'è': 'é', 'ì': 'í', 'ò': 'ó', 'ù': 'ú', 'ǜ': 'ǘ' };
  function tone3to2(py) { return py.replace(/[ǎěǐǒǔǚ]/g, c => T3_TO_T2[c]); }
  function tone1to2(py) { return py.replace(/[āēīōūǖ]/g, c => T1_TO_T2[c]); }
  function tone1to4(py) { return py.replace(/[āēīōūǖ]/g, c => T1_TO_T4[c]); }
  function tone4to2(py) { return py.replace(/[àèìòùǜ]/g, c => T4_TO_T2[c]); }

  /**
   * Applies all standard Mandarin tone sandhi rules:
   *  Pass 1 — cedict word-level lookup: overrides char-by-char pinyin-pro readings,
   *            fixing neutral tones that pinyin-pro misses in context.
   *  Pass 2 — 3rd+3rd sandhi: T3 before T3 → T2 (left-to-right, handles chains).
   *  Pass 3 — 一/不 sandhi: 一+T4→yí, 一+T1/2/3→yì; 不+T4→bú.
   * @param {string[]} chars
   * @param {string[]} pinyinArr
   * @returns {{ corrected: string[], correctedSet: Set<number> }}
   */
  function buildCorrectedPinyin(chars, pinyinArr) {
    const result = pinyinArr.slice();
    const correctedSet = new Set();

    // Pass 1: cedict word-level lookup (corrects neutral tones)
    let i = 0;
    while (i < chars.length) {
      let matched = false;
      for (let len = Math.min(8, chars.length - i); len >= 2; len--) {
        const entry = hpfDict[chars.slice(i, i + len).join('')];
        if (entry) {
          const syls = entry[0].split(' ');
          if (syls.length === len) {
            for (let j = 0; j < len; j++) {
              if (result[i + j] !== syls[j]) {
                result[i + j] = syls[j];
                correctedSet.add(i + j);
              }
            }
            i += len; matched = true; break;
          }
        }
      }
      if (!matched) i++;
    }

    // Pass 2: 3+3 sandhi (left-to-right scan handles chains: ni3 hao3 hao3 → ni2 hao2 hao3)
    for (let i = 0; i < result.length - 1; i++) {
      if (pinyinTone(result[i]) === 3 && pinyinTone(result[i + 1]) === 3) {
        result[i] = tone3to2(result[i]);
        correctedSet.add(i);
      }
    }

    // Pass 3: 一 and 不 sandhi
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === '一') {
        const nextTone = i + 1 < result.length ? pinyinTone(result[i + 1]) : 0;
        if (nextTone === 4) {
          result[i] = tone1to2(result[i]);
        } else if (nextTone >= 1 && nextTone <= 3) {
          result[i] = tone1to4(result[i]);
        } else {
          continue;
        }
        correctedSet.add(i);
      } else if (chars[i] === '不' && i + 1 < result.length && pinyinTone(result[i + 1]) === 4) {
        result[i] = tone4to2(result[i]);
        correctedSet.add(i);
      }
    }

    return { corrected: result, correctedSet };
  }

  // ── Tooltip hover ──────────────────────────────────────────────────────────
  let fadeTimer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);

  function positionTooltip(anchor) {
    const r = (anchor || zhBox).getBoundingClientRect();
    const gap = 8;
    const rt = anchor && anchor.querySelector('rt');
    const rtGap = rt ? rt.getBoundingClientRect().height : 0;
    let top = r.top - tooltip.offsetHeight - gap - rtGap;
    if (top < gap) top = r.bottom + gap;
    let left = r.left + r.width / 2 - tooltip.offsetWidth / 2;
    left = Math.max(gap, Math.min(left, window.innerWidth - tooltip.offsetWidth - gap));
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  function hideTooltip() {
    tooltip.classList.remove('hpf-tip-visible');
  }

  function startFade() {
    fadeTimer = setTimeout(hideTooltip, 250);
  }

  /** @param {{ word: string, pinyin: string, defs: string }} result @param {Element} [anchor] */
  function showTooltip(result, anchor) {
    clearTimeout(fadeTimer);
    fadeTimer = undefined;
    const alreadySaved = savedZh.has(result.word);
    tooltip.innerHTML =
      `<div class="hpf-tip-word" style="color:${cfg.zhColor}">${escapeHtml(result.word)}</div>` +
      `<div class="hpf-tip-pinyin">${escapeHtml(result.pinyin)}</div>` +
      `<div class="hpf-tip-defs">${escapeHtml(result.defs)}</div>` +
      `<button class="hpf-tip-save${alreadySaved ? ' saved' : ''}">${alreadySaved ? 'Saved ✓' : 'Save word'}</button>`;
    const saveBtn = tooltip.querySelector('.hpf-tip-save');
    if (saveBtn) saveBtn.addEventListener('click', () =>
      savedZh.has(result.word) ? unsaveWord(result) : saveWord(result));
    tooltip.classList.add('hpf-tip-visible');
    positionTooltip(anchor);
  }

  /** @param {{ word: string, pinyin: string, defs: string }} result */
  function saveWord(result) {
    const video = document.querySelector('video');
    const t = video ? video.currentTime - 2 : 0;
    const sep = location.href.includes('?') ? '&' : '?';
    const baseUrl = location.href.replace(/([&?])t=[^&]*/g, '').replace(/\?$/, '');
    const url = baseUrl + sep + 't=' + Math.floor(t);
    const entry = { zh: result.word, py: result.pinyin, en: result.defs, sentZh: lastZh, sentEn: lastEn, url };
    browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
      savedWords[entry.zh] = entry;
      return browser.storage.local.set({ savedWords });
    }).then(() => {
      savedZh.add(entry.zh);
      const btn = tooltip.querySelector('.hpf-tip-save');
      if (btn) { btn.textContent = 'Saved ✓'; btn.classList.add('saved'); }
    }).catch(err => console.error('storage error:', err));
  }

  /** @param {{ word: string, pinyin: string, defs: string }} result */
  function unsaveWord(result) {
    browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
      delete savedWords[result.word];
      return browser.storage.local.set({ savedWords });
    }).then(() => {
      savedZh.delete(result.word);
      const btn = tooltip.querySelector('.hpf-tip-save');
      if (btn) { btn.textContent = 'Save word'; btn.classList.remove('saved'); }
    }).catch(err => console.error('storage error:', err));
  }

  zhBox.addEventListener('mouseover', (e) => {
    if (!hpfDict) { loadDict(); return; }
    const ruby = /** @type {Element} */ (e.target).closest('ruby[data-idx]');
    if (!ruby) return;
    const idx = parseInt(/** @type {HTMLElement} */(ruby).dataset.idx, 10);
    const result = lookupWord(lastZh, idx);
    if (!result) return;
    showTooltip(result, ruby);
  });

  zhBox.addEventListener('mouseleave', startFade);
  tooltip.addEventListener('mouseenter', () => { clearTimeout(fadeTimer); fadeTimer = undefined; });
  tooltip.addEventListener('mouseleave', hideTooltip);

  // ── Track data from MAIN world ─────────────────────────────────────────────
  /** @type {Record<string, string> | null} */
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
  /** @param {Record<string, string>} trackUrls */
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
  /** @type {{ zh: Cue[], en: Cue[] }} */
  const cues = { zh: [], en: [] };

  /**
   * @param {'zh' | 'en'} lang
   * @param {string} url
   */
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

  // ── Ruby rendering ─────────────────────────────────────────────────────────
  /** @param {string} s @returns {string} */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** @param {string} text @returns {string} */
  function renderRuby(text) {
    if (!text) return '';
    const lib = /** @type {any} */ (globalThis.pinyinPro);
    if (!lib) return escapeHtml(text);
    const chars = [...text];
    let pinyinArr = /** @type {string[]} */ (lib.pinyin(text, { toneType: 'symbol', type: 'array' }));
    if (pinyinArr.length !== chars.length) return escapeHtml(text);
    let correctedSet = /** @type {Set<number>} */ (new Set());
    if (cfg.toneSandhi && hpfDict) {
      ({ corrected: pinyinArr, correctedSet } = buildCorrectedPinyin(chars, pinyinArr));
    }
    let sandhiColour = cfg.zhColor
    if (sandhiColour === '#ffffff') sandhiColour = cfg.enColor;
    if (sandhiColour === '#ffffff') sandhiColour = '#ffe97a';
    return chars.map((char, i) => {
      const py = pinyinArr[i] || '';
      const escaped = escapeHtml(char);
      if (py && py !== char && /[一-鿿㐀-䶿豈-﫿]/.test(char)) {
        const rtColor = correctedSet.has(i) ? sandhiColour : '#fff';
        correctedSet.has(i) ? LOG(`corrected pinyin for "${char}" at idx ${i}: ${py}`) : null;
        const rt = cfg.showPinyin ? `<rt style="color:${rtColor}">${py}</rt>` : '';
        return `<ruby data-idx="${i}">${escaped}${rt}</ruby>`;
      }
      return escaped;
    }).join('');
  }

  // ── Render loop ────────────────────────────────────────────────────────────
  let lastZh = '', lastEn = '', lastLogTime = -1, lastShowPinyin = /** @type {boolean|null} */ (null), lastToneSandhi = /** @type {boolean|null} */ (null);

  function tick() {
    attachOverlay();
    applyStyle();

    const video = document.querySelector('video');

    // When inside a player container, bottom % is relative to its height — no scroll tracking needed.
    // Fall back to manual fixed positioning if we're on document.body.
    if (overlayContainer && overlayContainer !== document.body) {
      root.style.bottom = (cfg.subPosition || 8) + '%';
    } else if (video) {
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

    const showPinyinChanged = cfg.showPinyin !== lastShowPinyin;
    if (showPinyinChanged) lastShowPinyin = cfg.showPinyin;
    const toneSandhiChanged = cfg.toneSandhi !== lastToneSandhi;
    if (toneSandhiChanged) lastToneSandhi = cfg.toneSandhi;

    const zhIsZh = /^zh/i.test(cfg.zhTrack || '');
    const enIsZh = /^zh/i.test(cfg.enTrack || '');

    if (zh !== lastZh || showPinyinChanged || toneSandhiChanged) {
      lastZh = zh;
      if (zhIsZh) zhBox.innerHTML = renderRuby(zh);
      else zhBox.textContent = zh;
    }
    if (en !== lastEn || showPinyinChanged || toneSandhiChanged) {
      lastEn = en;
      if (enIsZh) enBox.innerHTML = renderRuby(en);
      else enBox.textContent = en;
    }

    zhBox.style.display = zh ? '' : 'none';
    enBox.style.display = (cfg.enTrack && en) ? '' : 'none';
  }

  loadDict();
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