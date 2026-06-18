// @ts-check
import { browser, LOG, cfg, cues, renderState } from './state.js';
import { root, topBox, bottomBox, overlayContainer, attachOverlay, showSiteSubs } from './dom.js';
import { detectLang, loadDict, loadKuromoji, loadJaDict, getKuromoji, renderJapanese, buildCorrectedPinyin, getHpfDict } from './lang.js';

// ── Apply styles ───────────────────────────────────────────────────────────
export function applyStyle() {
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
export function readText(selector) {
  return [...document.querySelectorAll(selector)]
    .map(el => el.textContent.trim()).filter(Boolean).join(' ');
}

/** @param {Element} el @param {string} html */
export function setHTML(el, html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  el.replaceChildren(...doc.body.childNodes);
}

/** @param {string} s @returns {string} */
export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Ruby rendering ─────────────────────────────────────────────────────────
/** @param {string} text @returns {string} */
export function renderRuby(text) {
  if (!text) return '';
  const lib = /** @type {any} */ (globalThis.pinyinPro);
  if (!lib) return escapeHtml(text);
  const chars = [...text];
  let pinyinArr = /** @type {string[]} */ (lib.pinyin(text, { toneType: 'symbol', type: 'array' }));
  if (pinyinArr.length !== chars.length) return escapeHtml(text);
  const rawPinyinArr = pinyinArr.slice();
  let correctedSet = /** @type {Set<number>} */ (new Set());
  const hpfDict = getHpfDict();
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

// ── Cue parsing ────────────────────────────────────────────────────────────
/**
 * @param {'top' | 'bottom'} slot
 * @param {string} url
 */
export async function parseCues(slot, url) {
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

// ── Render loop ────────────────────────────────────────────────────────────
export function tick() {
  if (document.hidden) return;
  attachOverlay();
  applyStyle();

  const video = document.querySelector('video');

  if (overlayContainer && overlayContainer !== document.body) {
    root.style.bottom = (cfg.subPosition || 8) + '%';
  } else if (video) {
    const r = video.getBoundingClientRect();
    root.style.left = (r.left + r.width / 2) + 'px';
    root.style.bottom = (window.innerHeight - r.bottom + r.height * (cfg.subPosition || 8) / 100) + 'px';
    root.style.maxWidth = (r.width * 0.9) + 'px';
  }

  const t = video ? video.currentTime : -1;
  // Use the last matching cue — auto-generated subs have overlapping rolling-window events
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

  if (t > 0 && Math.floor(t) % 2 === 0 && Math.floor(t) !== renderState.lastLogTime) {
    renderState.lastLogTime = Math.floor(t);
    LOG(`t=${t.toFixed(1)}s top=${cues.top.length} bottom=${cues.bottom.length} | "${top}" / "${bottom}"`);
  }

  if (cfg.track1 && !top && !cues.top.length) top = readText('.bpx-player-subtitle-inner span, .bilibili-player-video-subtitle span');
  if (cfg.track2 && !bottom && !cues.bottom.length) bottom = readText('.bpx-player-subtitle-wrap > div:nth-child(2) .bpx-player-subtitle-inner span');

  const effectivePinyin = (cfg.learnMode === 'zh' || cfg.learnMode === 'ja') && cfg.pinyinEnabled;
  const showPinyinChanged = effectivePinyin !== renderState.lastShowPinyin;
  if (showPinyinChanged) renderState.lastShowPinyin = effectivePinyin;
  const effectiveSandhi = cfg.learnMode === 'zh' && cfg.pinyinEnabled && cfg.sandhiEnabled;
  const toneSandhiChanged = effectiveSandhi !== renderState.lastSandhiEnabled;
  if (toneSandhiChanged) renderState.lastSandhiEnabled = effectiveSandhi;

  if (cfg.learnMode === 'ja' && !getKuromoji()) loadKuromoji();
  if (cfg.learnMode === 'ja') loadJaDict();

  const topLang = detectLang(cfg.track1 || '');
  const bottomLang = detectLang(cfg.track2 || '');

  if (top !== renderState.lastTop || showPinyinChanged || toneSandhiChanged) {
    renderState.lastTop = top;
    if (topLang === 'zh' && cfg.learnMode === 'zh') setHTML(topBox, renderRuby(top));
    else if (topLang === 'ja' && cfg.learnMode === 'ja') setHTML(topBox, renderJapanese(top));
    else topBox.textContent = top;
  }
  if (bottom !== renderState.lastBottom || showPinyinChanged || toneSandhiChanged) {
    renderState.lastBottom = bottom;
    if (bottomLang === 'zh' && cfg.learnMode === 'zh') setHTML(bottomBox, renderRuby(bottom));
    else if (bottomLang === 'ja' && cfg.learnMode === 'ja') setHTML(bottomBox, renderJapanese(bottom));
    else bottomBox.textContent = bottom;
  }

  topBox.style.display = top ? '' : 'none';
  bottomBox.style.display = (cfg.track2 && bottom) ? '' : 'none';
}

loadDict();
setInterval(tick, 80);
