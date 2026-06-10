// @ts-check

/**
 * @typedef {{ fontScale: number, subPosition: number, track1: string, track2: string,
 *             track1Color: string, track2Color: string, stroke: boolean, window: boolean, shadow: boolean,
 *             learnMode: 'none'|'en'|'zh'|'ja', pinyinEnabled: boolean, sandhiEnabled: boolean }} Config
 * @typedef {{ start: number, end: number, text: string }} Cue
 */

(function () {
  'use strict';
  /* global chrome */
  const browser = globalThis.browser ?? globalThis.chrome;

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
    .hpf-box .dusub-word {
      pointer-events: auto;
      cursor: default;
      display: inline;
    }
  `;
  document.head.appendChild(styleEl);

  const root = document.createElement('div'); root.id = 'hpf-root';
  const topBox = document.createElement('div'); topBox.className = 'hpf-box';
  const bottomBox = document.createElement('div'); bottomBox.className = 'hpf-box';
  root.appendChild(topBox);
  root.appendChild(bottomBox);

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
    track1: '', track2: '',
    track1Color: '#ffffff', track2Color: '#ffe97a',
    stroke: true, window: false, shadow: false,
    learnMode: 'none', pinyinEnabled: true, sandhiEnabled: true,
  };

  /** @type {Config} */
  let cfg = { ...DEFAULTS };

  /** @type {Set<string>} */
  const savedZh = new Set();

  browser.storage.local.get({ ...DEFAULTS, savedWords: {}, zhTrack: null, enTrack: null, zhColor: null, enColor: null }).then(s => {
    // One-time migration: zhTrack/enTrack/zhColor/enColor → track1/track2/track1Color/track2Color
    const migrate = {};
    if (s.zhTrack !== null && !s.track1) { s.track1 = s.zhTrack; migrate.track1 = s.zhTrack; }
    if (s.enTrack !== null && !s.track2) { s.track2 = s.enTrack; migrate.track2 = s.enTrack; }
    if (s.zhColor !== null && s.track1Color === DEFAULTS.track1Color) { s.track1Color = s.zhColor; migrate.track1Color = s.zhColor; }
    if (s.enColor !== null && s.track2Color === DEFAULTS.track2Color) { s.track2Color = s.enColor; migrate.track2Color = s.enColor; }
    if (Object.keys(migrate).length) browser.storage.local.set(migrate);
    cfg = { ...s, track1: DEFAULTS.track1, track2: DEFAULTS.track2 };
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
        cfg[key] = changes[key].newValue;
      }
    }
    if ('learnMode' in changes) {
      lastTop = ''; lastBottom = '';
      if (changes.learnMode.newValue === 'ja') { loadKuromoji(); loadJaDict(); }
    }
    applyStyle();

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

  // ── Language detection ─────────────────────────────────────────────────────
  /** @param {string} code @returns {'zh' | 'ja' | 'en'} */
  function detectLang(code) {
    if (/^zh/i.test(code)) return 'zh';
    if (/^ja/i.test(code)) return 'ja';
    return 'en';
  }

  // ── Apply styles ───────────────────────────────────────────────────────────
  function applyStyle() {
    const scale = (cfg.fontScale || 100) / 100;
    const baseSz = 40;
    const cjkSz = Math.round(baseSz * scale);
    const defaultSz = Math.round(cjkSz * 0.8);

    const stroke = cfg.stroke ? `${defaultSz * 0.1}px #000` : '0px #000';
    const shadow = cfg.shadow ? '0px 0px 6px rgba(0,0,0,1)' : 'none';
    const defaultBoxStyle = `
      font-family: Arial, sans-serif;
      line-height: 1.4;
      text-align: center;
      -webkit-text-stroke: ${stroke};
      paint-order: stroke fill;
      text-shadow: ${shadow};
    `;
    const cjkExtras = `
      font-family: sans-serif;
      letter-spacing: 0;
      line-height: normal;
      font-size: ${cjkSz}px;
    `;

    const topLang = detectLang(cfg.track1 || '');
    const bottomLang = detectLang(cfg.track2 || '');
    /** @param {'zh'|'ja'|'en'} lang */
    const isCjk = (lang) => lang === 'zh' || lang === 'ja';

    const topNeedsRubyPad = cfg.pinyinEnabled && (
      (topLang === 'zh' && cfg.learnMode === 'zh') ||
      (topLang === 'ja' && cfg.learnMode === 'ja')
    );
    const topWinBg = cfg.window
      ? `background:rgba(0,0,0,0.5);padding:${topNeedsRubyPad ? '.25em' : '0'} 10px 0;border-radius:3px;`
      : '';
    const winBg = cfg.window ? 'background:rgba(0,0,0,0.5);padding:0 10px;border-radius:3px;' : '';

    topBox.style.cssText = defaultBoxStyle + topWinBg + `color: ${cfg.track1Color};` + (isCjk(topLang) ? cjkExtras : `font-size: ${defaultSz}px;`);
    bottomBox.style.cssText = defaultBoxStyle + winBg + `color: ${cfg.track2Color}; margin-top: 4px;` + (isCjk(bottomLang) ? cjkExtras : `font-size: ${defaultSz}px;`);

    root.style.display = (cfg.track1 || cfg.track2) ? '' : 'none';
    if (!cfg.track1 && !cfg.track2) showSiteSubs();
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

  // ── Japanese ───────────────────────────────────────────────────────────────
  /** @type {any} */
  let kuromoji = null;
  let kuromojiLoading = false;

  async function loadKuromoji() {
    if (kuromoji || kuromojiLoading) return;
    kuromojiLoading = true;
    const lib = globalThis.kuromoji;
    if (!lib?.builder) { kuromojiLoading = false; return; }

    // pre-fetch all dict files as blob URLs so kuromoji's XHR can reach them
    const files = ['base', 'cc', 'check', 'tid', 'tid_pos', 'tid_map',
      'unk', 'unk_pos', 'unk_map', 'unk_char', 'unk_compat', 'unk_invoke'];
    const blobs = {};
    await Promise.all(files.map(async name => {
      const res = await fetch(browser.runtime.getURL(`dict/${name}.dat.gz`));
      blobs[`${name}.dat.gz`] = URL.createObjectURL(await res.blob());
    }));

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      const file = url.split('/').pop();
      return origOpen.call(this, method, blobs[file] ?? url);
    };

    try {
      kuromoji = await new Promise((resolve, reject) =>
        lib.builder({ dicPath: browser.runtime.getURL('dict/') })
          .build((err, tok) => err ? reject(err) : resolve(tok))
      );
      XMLHttpRequest.prototype.open = origOpen; // restore
      Object.values(blobs).forEach(URL.revokeObjectURL);
      LOG('kuromoji loaded ✓');
      lastTop = ''; lastBottom = '';
    } catch (e) {
      XMLHttpRequest.prototype.open = origOpen;
      LOG('kuromoji load failed:', e);
      kuromojiLoading = false;
    }
  }


  function toHiragana(katakana) {
    return (katakana || '').replace(/[ァ-ヶ]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  function hasKanji(text) {
    return /[一-鿿㐀-䶿]/.test(text);
  }

  /** @type {Record<string, { rd: string, en: string[], pos: string }> | null} */
  let jaDict = null;
  let jaDictLoading = false;

  async function loadJaDict() {
    if (jaDict || jaDictLoading) return;
    jaDictLoading = true;
    try {
      const resp = await fetch(browser.runtime.getURL('ja-dict.json'));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      jaDict = await resp.json();
      LOG('jaDict loaded:', Object.keys(jaDict).length, 'entries');
    } catch (e) {
      LOG('jaDict load failed:', e);
      jaDictLoading = false;
    }
  }

  /** @param {{ baseForm: string, surface: string }} token */
  function lookupJapanese(token) {
    if (!jaDict) return null;
    return jaDict[token.baseForm] ?? jaDict[token.surface] ?? null;
  }

  /** @param {string} text @returns {string} */
  function renderJapanese(text) {
    if (!kuromoji) { loadKuromoji(); return escapeHtml(text); }
    const tokens = kuromoji.tokenize(text);
    return tokens.map(token => {
      const surface = token.surface_form;
      const baseForm = (token.basic_form && token.basic_form !== '*') ? token.basic_form : surface;
      const reading = token.reading;
      const escapedSurface = escapeHtml(surface);
      const escapedBase = escapeHtml(baseForm);
      if (hasKanji(surface) && reading) {
        const hi = escapeHtml(toHiragana(reading));
        const rt = cfg.pinyinEnabled ? `<rt>${hi}</rt>` : '';
        return `<span class="dusub-word" data-base="${escapedBase}"><ruby>${escapedSurface}${rt}</ruby></span>`;
      }
      return cfg.pinyinEnabled && hasKanji(text) ?
        `<span class="dusub-word" data-base="${escapedBase}"><ruby>${escapedSurface}<rt/></ruby></span>` :
        `<span class="dusub-word" data-base="${escapedBase}">${escapedSurface}</span>`;
    }).join('');
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
    const r = (anchor || topBox).getBoundingClientRect();
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
    const btn = tooltip.querySelector('.hpf-tip-save');
    if (btn) { btn.textContent = 'Save word'; btn.classList.remove('saved'); }
  }

  function startFade() {
    fadeTimer = setTimeout(hideTooltip, 250);
  }

  function trimDefinition(en) {
    const shortDef = en.split(';').slice(0, 4).join(';')
    return shortDef.replace(/\[.*?\]\s*/g, '').replace(/\(.*?\)\s*/g, '').replace(/;{2,}/g, ';').replace(/;\s*$/, '').trim()
  }

  /** @param {{ word: string, pinyin: string, defs: string }} result @param {Element} [anchor] */
  function showTooltip(result, anchor) {
    clearTimeout(fadeTimer);
    fadeTimer = undefined;
    const alreadySaved = savedZh.has(result.word);
    tooltip.innerHTML =
      `<div class="hpf-tip-word" style="color:${cfg.track1Color}">${escapeHtml(result.word)}</div>` +
      `<div class="hpf-tip-pinyin">${escapeHtml(result.pinyin)}</div>` +
      `<div class="hpf-tip-defs">${escapeHtml(trimDefinition(result.defs))}</div>` +
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
    const sentField = `sent${cfg.learnMode.charAt(0).toUpperCase()}${cfg.learnMode.slice(1)}`;
    const entry = { [cfg.learnMode]: result.word, py: result.pinyin, en: trimDefinition(result.defs), [sentField]: lastTop, sentEn: lastBottom, url, language: cfg.learnMode };
    browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
      savedWords[result.word] = entry;
      return browser.storage.local.set({ savedWords });
    }).then(() => {
      savedZh.add(result.word);
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

  function attachHover(box, trackFn, getLastText) {
    box.addEventListener('mouseover', (e) => {
      const track = trackFn();
      if (cfg.learnMode === 'none' || !track || !track.startsWith(cfg.learnMode)) return;

      if (cfg.learnMode === 'ja') {
        const wordSpan = /** @type {Element} */ (e.target).closest('.dusub-word[data-base]');
        if (!wordSpan) return;
        if (!jaDict) { loadJaDict(); return; }
        const base = /** @type {HTMLElement} */ (wordSpan).dataset.base;
        const entry = jaDict[base];
        if (!entry) return;
        const defs = entry.en.join('; ');
        const pos = entry.pos ? `[${entry.pos}] ` : '';
        const romaji = entry.rm || '';
        const reading = hasKanji(base)
          ? [entry.rd, romaji].filter(Boolean).join('  ')
          : romaji || entry.rd;
        showTooltip({ word: base, pinyin: reading, defs: pos + defs }, wordSpan);
        return;
      }

      if (!hpfDict) { loadDict(); return; }
      const charEl = /** @type {Element} */ (e.target).closest('[data-idx]');
      if (!charEl) return;
      const idx = parseInt(/** @type {HTMLElement} */(charEl).dataset.idx, 10);
      const result = lookupWord(getLastText(), idx);
      if (!result) return;
      const wordLen = [...result.word].length;
      const charEls = [...box.querySelectorAll('[data-idx]')]
        .filter(r => { const ri = parseInt(/** @type {HTMLElement} */(r).dataset.idx, 10); return ri >= idx && ri < idx + wordLen; });
      const ctxPinyin = charEls.map(r => /** @type {HTMLElement} */(r).dataset.py || '').join(' ').trim();
      showTooltip({ ...result, pinyin: ctxPinyin || result.pinyin }, charEl);
    });
    box.addEventListener('mouseleave', startFade);
  }
  attachHover(topBox, () => cfg.track1, () => lastTop);
  attachHover(bottomBox, () => cfg.track2, () => lastBottom);
  tooltip.addEventListener('mouseenter', () => { clearTimeout(fadeTimer); fadeTimer = undefined; });
  tooltip.addEventListener('mouseleave', hideTooltip);

  // ── Track data from MAIN world ─────────────────────────────────────────────
  /** @type {Record<string, string> | null} */
  let lastTrackUrls = null;
  /** @type {{ languageCode: string, name: string }[]} */
  let localTracks = [];
  let trackManuallySet = false;

  window.addEventListener(CHANNEL, (e) => {
    if (document.hidden) return;
    const { type, payload } = e.detail || {};
    if (type !== 'tracks') return;
    const { videoId, tracks } = payload;
    LOG('tracks from main, videoId:', videoId, 'count:', tracks.length);
    cues.top = []; cues.bottom = [];
    localTracks = tracks.map(t => ({ languageCode: t.code, name: t.name }));
    browser.storage.local.set({ availableTracks: localTracks }).catch(() => { });
    lastTrackUrls = Object.fromEntries(tracks.map(t => [t.code, t.url]));
    if (!trackManuallySet) {
      const tlist = /** @type {{ code: string }[]} */ (tracks);
      if (!cfg.track1) cfg.track1 = tlist.find(t => t.code.startsWith('zh'))?.code || tlist.find(t => t.code.startsWith('ja'))?.code || '';
      if (!cfg.track2) cfg.track2 = tlist.find(t => t.code.startsWith('en'))?.code || '';
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

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'subtitle-url') {
      if (document.hidden) return;
      let slot = null;
      if (msg.lang === 'top' || msg.lang === 'bottom') {
        slot = msg.lang;
      } else {
        // passive intercept sends guessed lang prefix ('zh', 'en', etc.) — map to slot
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
      cfg.track1 = t1; cfg.track2 = t2;
      trackManuallySet = true;
      if (changed) {
        cues.top = []; cues.bottom = [];
        lastTop = ''; lastBottom = '';
        if (lastTrackUrls) fetchSubtitles(lastTrackUrls);
      }
      sendResponse({ ok: true });
      return true;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && lastTrackUrls && (cfg.track1 || cfg.track2) && !cues.top.length && !cues.bottom.length) {
      fetchSubtitles(lastTrackUrls);
    }
  });

  // ── Cue parsing ────────────────────────────────────────────────────────────
  /** @type {{ top: Cue[], bottom: Cue[] }} */
  const cues = { top: [], bottom: [] };

  /**
   * @param {'top' | 'bottom'} slot
   * @param {string} url
   */
  async function parseCues(slot, url) {
    try {
      const resp = await browser.runtime.sendMessage({ type: 'fetch-text', url });
      if (!resp?.ok) return;
      let parsed = [];
      try {
        const data = JSON.parse(resp.text);
        if (Array.isArray(data.body)) {
          // Bilibili format: { body: [{ from, to, content }] }
          parsed = data.body.map(e => ({
            start: e.from,
            end: e.to,
            text: (e.content || '').trim(),
          })).filter(c => c.text);
        } else {
          // YouTube JSON3 format: { events: [{ tStartMs, dDurationMs, segs }] }
          parsed = (data.events || []).filter(e => e.segs).map(e => ({
            start: e.tStartMs / 1000,
            end: (e.tStartMs + (e.dDurationMs || 0)) / 1000,
            text: e.segs.map(s => s.utf8 || '').join('').trim(),
          })).filter(c => c.text);
        }
      } catch (_) {
        const doc = new DOMParser().parseFromString(resp.text, 'text/xml');
        parsed = [...doc.querySelectorAll('text')].map(el => ({
          start: parseFloat(el.getAttribute('start')),
          end: parseFloat(el.getAttribute('start')) + parseFloat(el.getAttribute('dur') || 0),
          text: el.textContent.trim(),
        })).filter(c => c.text);
      }
      if (parsed.length) {
        cues[slot] = parsed;
        LOG(`parseCues(${slot}) ${parsed.length} cues, first:`, JSON.stringify(parsed[0]));
      } else {
        LOG(`parseCues(${slot}) 0 cues, preview:`, resp.text?.slice(0, 200));
      }
    } catch (err) {
      LOG(`parseCues(${slot}) exception:`, err);
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
    const rawPinyinArr = pinyinArr.slice();
    let correctedSet = /** @type {Set<number>} */ (new Set());
    if (cfg.learnMode === 'zh' && cfg.pinyinEnabled && cfg.sandhiEnabled && hpfDict) {
      ({ corrected: pinyinArr, correctedSet } = buildCorrectedPinyin(chars, pinyinArr));
    }
    let sandhiColour = cfg.track1Color;
    if (sandhiColour === '#ffffff') sandhiColour = cfg.track2Color;
    if (sandhiColour === '#ffffff') sandhiColour = '#ffe97a';
    return chars.map((char, i) => {
      const py = pinyinArr[i] || '';
      const escaped = escapeHtml(char);
      if (py && py !== char && /[一-鿿㐀-䶿豈-﫿]/.test(char)) {
        const rtColor = correctedSet.has(i) ? sandhiColour : '#fff';
        correctedSet.has(i) ? LOG(`corrected pinyin for "${char}" at idx ${i}: ${py}`) : null;
        const rtStyle = (cfg.learnMode === 'zh' && cfg.pinyinEnabled) ? `color:${rtColor}` : 'visibility:hidden';
        return `<ruby data-idx="${i}" data-py="${rawPinyinArr[i]}">${escaped}<rt style="${rtStyle}">${py}</rt></ruby>`;
      }
      return escaped;
    }).join('');
  }

  // ── Render loop ────────────────────────────────────────────────────────────
  let lastTop = '', lastBottom = '', lastLogTime = -1, lastShowPinyin = /** @type {boolean|null} */ (null), lastSandhiEnabled = /** @type {boolean|null} */ (null);

  function tick() {
    if (document.hidden) return;
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
    // Use the last matching cue — auto-generated subs have overlapping rolling-window events;
    // the latest-starting match is the most complete text at this moment.
    const findCue = (/** @type {'top'|'bottom'} */ slot) => {
      let text = '';
      for (const c of cues[slot]) {
        if (c.start > t) break;
        if (t < c.end) text = c.text;
      }
      return text;
    };

    let top = cfg.track1 ? findCue('top') : '';
    let bottom = cfg.track2 ? findCue('bottom') : '';

    if (t > 0 && Math.floor(t) % 2 === 0 && Math.floor(t) !== lastLogTime) {
      lastLogTime = Math.floor(t);
      LOG(`t=${t.toFixed(1)}s top=${cues.top.length} bottom=${cues.bottom.length} | "${top}" / "${bottom}"`);
    }

    if (cfg.track1 && !top && !cues.top.length) top = readText('.bpx-player-subtitle-inner span, .bilibili-player-video-subtitle span');
    if (cfg.track2 && !bottom && !cues.bottom.length) bottom = readText('.bpx-player-subtitle-wrap > div:nth-child(2) .bpx-player-subtitle-inner span');

    const effectivePinyin = (cfg.learnMode === 'zh' || cfg.learnMode === 'ja') && cfg.pinyinEnabled;
    const showPinyinChanged = effectivePinyin !== lastShowPinyin;
    if (showPinyinChanged) lastShowPinyin = effectivePinyin;
    const effectiveSandhi = cfg.learnMode === 'zh' && cfg.pinyinEnabled && cfg.sandhiEnabled;
    const toneSandhiChanged = effectiveSandhi !== lastSandhiEnabled;
    if (toneSandhiChanged) lastSandhiEnabled = effectiveSandhi;

    if (cfg.learnMode === 'ja' && !kuromoji) loadKuromoji();
    if (cfg.learnMode === 'ja' && !jaDict) loadJaDict();

    const topLang = detectLang(cfg.track1 || '');
    const bottomLang = detectLang(cfg.track2 || '');

    if (top !== lastTop || showPinyinChanged || toneSandhiChanged) {
      lastTop = top;
      if (topLang === 'zh' && cfg.learnMode === 'zh') topBox.innerHTML = renderRuby(top);
      else if (topLang === 'ja' && cfg.learnMode === 'ja') topBox.innerHTML = renderJapanese(top);
      else topBox.textContent = top;
    }
    if (bottom !== lastBottom || showPinyinChanged || toneSandhiChanged) {
      lastBottom = bottom;
      if (bottomLang === 'zh' && cfg.learnMode === 'zh') bottomBox.innerHTML = renderRuby(bottom);
      else if (bottomLang === 'ja' && cfg.learnMode === 'ja') bottomBox.innerHTML = renderJapanese(bottom);
      else bottomBox.textContent = bottom;
    }

    topBox.style.display = top ? '' : 'none';
    bottomBox.style.display = (cfg.track2 && bottom) ? '' : 'none';
  }

  loadDict();
  setInterval(tick, 80);

  // ── Hide YouTube's native subtitles once ours are showing ──────────────────
  let siteSubsHidden = false;
  let siteSubsStyleEl = null;

  function hideSiteSubs() {
    if (document.hidden) return;
    if (!cfg.track1 && !cfg.track2) return;
    if (siteSubsHidden || (!lastTop && !lastBottom)) return;
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
