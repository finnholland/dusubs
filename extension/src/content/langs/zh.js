// @ts-check
import { cfg } from '../state.js';
import { escapeHtml, lazyDict } from './shared.js';
import { buildCorrectedPinyin } from './zh-sandhi.js';

/** @type {ReturnType<typeof lazyDict<Record<string, [string, string]>>>} */
const dict = lazyDict('vendor/cedict.json.gz', 'cedict');

/** Longest cedict match starting at `idx`. @param {string} text @param {number} idx */
function lookupWord(text, idx) {
  const entries = dict.get();
  if (!entries) return null;
  const chars = [...text];
  for (let len = Math.min(8, chars.length - idx); len >= 1; len--) {
    const word = chars.slice(idx, idx + len).join('');
    const entry = entries[word];
    if (entry) return { word, pinyin: entry[0], defs: entry[1] };
  }
  return null;
}

/** @param {string} text @returns {string} */
function render(text) {
  if (!text) return '';
  const lib = /** @type {any} */ (globalThis.pinyinPro);
  if (!lib) return escapeHtml(text);
  const chars = [...text];
  let pinyinArr = /** @type {string[]} */ (lib.pinyin(text, { toneType: 'symbol', type: 'array' }));
  if (pinyinArr.length !== chars.length) return escapeHtml(text);
  const rawPinyinArr = pinyinArr.slice();
  let correctedSet = /** @type {Set<number>} */ (new Set());
  const entries = dict.get();
  if (cfg.pinyinEnabled && cfg.sandhiEnabled && entries) {
    ({ corrected: pinyinArr, correctedSet } = buildCorrectedPinyin(chars, pinyinArr, entries));
  }
  // Highlight corrected syllables with the first non-white track colour
  const sandhiColour = [cfg.track1Color, cfg.track2Color].find(c => c !== '#ffffff') ?? '#ffe97a';
  return chars.map((char, i) => {
    const py = pinyinArr[i] || '';
    const escaped = escapeHtml(char);
    if (py && py !== char && /[一-鿿㐀-䶿豈-﫿]/.test(char)) {
      const rtColor = correctedSet.has(i) ? sandhiColour : '#fff';
      const rtStyle = cfg.pinyinEnabled ? `color:${rtColor}; margin-bottom:6px` : 'visibility:hidden';
      return `<ruby data-idx="${i}" data-py="${rawPinyinArr[i]}">${escaped}<rt style="${rtStyle}">${py}</rt></ruby>`;
    }
    return escaped;
  }).join('');
}

/** @type {import('./index.js').LangModule} */
export default {
  load: () => dict.load(),
  render,
  hover(target, { box, text }) {
    if (!dict.get()) { dict.load(); return null; }
    const charEl = target.closest('[data-idx]');
    if (!charEl) return null;
    const idx = parseInt(/** @type {HTMLElement} */ (charEl).dataset.idx ?? '', 10);
    const result = lookupWord(text, idx);
    if (!result) return null;
    const wordLen = [...result.word].length;
    // Context-aware pinyin (after sandhi/pinyin-pro) for the characters the word covers
    const ctxPinyin = [...box.querySelectorAll('[data-idx]')]
      .map(r => /** @type {HTMLElement} */ (r).dataset)
      .filter(d => { const ri = parseInt(d.idx ?? '', 10); return ri >= idx && ri < idx + wordLen; })
      .map(d => d.py || '').join(' ').trim();
    return { result: { ...result, pinyin: ctxPinyin || result.pinyin }, anchor: charEl };
  },
};
