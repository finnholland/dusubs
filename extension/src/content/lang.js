// @ts-check
import { browser, LOG, cfg } from './state.js';
import { getActiveLearnLang } from './detect-lang.js';

/** @param {string} s @returns {string} */
export /** Fetches a gzipped JSON file bundled with the extension. @param {string} path */
async function fetchGzipJson(path) {
  const resp = await fetch(browser.runtime.getURL(path));
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).json();
}

// ── Chinese dictionary ─────────────────────────────────────────────────────
/** @type {Record<string, [string, string]> | null} */
let hpfDict = null;
let dictLoading = false;

export function getHpfDict() { return hpfDict; }

export async function loadDict() {
  if (hpfDict || dictLoading) return;
  dictLoading = true;
  try {
    hpfDict = await fetchGzipJson('vendor/cedict.json.gz');
    LOG('dict loaded:', Object.keys(hpfDict).length, 'entries');
  } catch (e) {
    LOG('dict load failed:', e);
    dictLoading = false;
  }
}

/** @param {string} text @param {number} idx */
export function lookupWord(text, idx) {
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

/** @type {Record<string, { rd: string, en: string[], pos: string }> | null} */
let jaDict = null;
let jaDictLoading = false;
/** Reverse index: hiragana reading → best entry (first common noun/verb, not particle/aux) */
let jaRdIndex = /** @type {Record<string, { rd: string, en: string[], pos: string }> | null} */ (null);

export function getJaDict() { return jaDict; }
export function getJaRdIndex() { return jaRdIndex; }

export async function loadKuromoji() {
  if (kuromoji || kuromojiLoading) return;
  kuromojiLoading = true;
  const lib = globalThis.kuromoji;
  if (!lib?.builder) { kuromojiLoading = false; return; }

  const files = ['base', 'cc', 'check', 'tid', 'tid_pos', 'tid_map',
    'unk', 'unk_pos', 'unk_map', 'unk_char', 'unk_compat', 'unk_invoke'];
  /** @type {Record<string, string>} */
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
    XMLHttpRequest.prototype.open = origOpen;
    Object.values(blobs).forEach(URL.revokeObjectURL);
    LOG('kuromoji loaded ✓');
  } catch (e) {
    XMLHttpRequest.prototype.open = origOpen;
    LOG('kuromoji load failed:', e);
    kuromojiLoading = false;
  }
}

export async function loadJaDict() {
  if (jaDict || jaDictLoading) return;
  jaDictLoading = true;
  try {
    jaDict = await fetchGzipJson('vendor/ja-dict.json.gz');
    // Build reverse reading index: hiragana → entry, for when kuromoji returns
    // kana basic_form (e.g. ほう for 方). Kanji-keyed entries win over kana-keyed
    // entries since they're more specific (方 beats 報 for reading ほう).
    jaRdIndex = {};
    // Pass 1: kanji-keyed entries only
    for (const [key, entry] of Object.entries(jaDict)) {
      if (hasKanji(key) && !jaRdIndex[entry.rd]) jaRdIndex[entry.rd] = entry;
    }
    // Pass 2: kana-keyed entries fill gaps
    for (const [key, entry] of Object.entries(jaDict)) {
      if (!hasKanji(key) && !jaRdIndex[entry.rd]) jaRdIndex[entry.rd] = entry;
    }
    LOG('jaDict loaded:', Object.keys(jaDict).length, 'entries');
  } catch (e) {
    LOG('jaDict load failed:', e);
    jaDictLoading = false;
  }
}

// ── Spanish dictionary ─────────────────────────────────────────────────────
/** @type {Record<string, { en: string[], pos: string }> | null} */
let esDict = null;
let esDictLoading = false;

export function getEsDict() { return esDict; }

export async function loadEsDict() {
  if (esDict || esDictLoading) return;
  esDictLoading = true;
  try {
    esDict = await fetchGzipJson('vendor/es-dict.json.gz');
    LOG('esDict loaded:', Object.keys(esDict).length, 'entries');
  } catch (e) {
    LOG('esDict load failed:', e);
    esDictLoading = false;
  }
}

/** @param {string} word */
export function lookupSpanish(word) {
  if (!esDict) return null;
  return esDict[word] ?? esDict[word.toLowerCase()] ?? null;
}

/** @param {string} text @returns {string} */
export function renderSpanish(text) {
  if (!text) return '';
  // Split on whitespace and punctuation, preserving delimiters as separate tokens
  const tokens = text.split(/(\s+|[¡!¿?.,;:"""''«»—\-()])/);
  return tokens.map(tok => {
    if (!tok) return '';
    if (/^\s+$/.test(tok) || /^[¡!¿?.,;:"""''«»—\-()\s]+$/.test(tok)) return escapeHtml(tok);
    const escaped = escapeHtml(tok);
    return `<span class="dusub-word" data-base="${escaped}">${escaped}</span>`;
  }).join('');
}

/** @param {string} katakana */
export function toHiragana(katakana) {
  return (katakana || '').replace(/[ァ-ヶ]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/** @param {string} text */
export function hasKanji(text) {
  return /[一-鿿㐀-䶿]/.test(text);
}

/** @param {string} text @returns {string} */
export function renderChinese(text) {
  if (!text) return '';
  const lib = /** @type {any} */ (globalThis.pinyinPro);
  if (!lib) return escapeHtml(text);
  const chars = [...text];
  let pinyinArr = /** @type {string[]} */ (lib.pinyin(text, { toneType: 'symbol', type: 'array' }));
  if (pinyinArr.length !== chars.length) return escapeHtml(text);
  const rawPinyinArr = pinyinArr.slice();
  let correctedSet = /** @type {Set<number>} */ (new Set());
  const hpfDict = getHpfDict();
  if (getActiveLearnLang(cfg) === 'zh' && cfg.pinyinEnabled && cfg.sandhiEnabled && hpfDict) {
    ({ corrected: pinyinArr, correctedSet } = buildCorrectedPinyin(chars, pinyinArr));
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

/** @param {string} text @returns {string} */
export function renderJapanese(text) {
  if (!text) return '';
  if (!kuromoji) { loadKuromoji(); return escapeHtml(text); }
  const rtStyle = cfg.pinyinEnabled ? 'color:#fff; margin-bottom:6px' : 'visibility:hidden';
  const textHasKanji = hasKanji(text);
  return kuromoji.tokenize(text).map(token => {
    const surface = token.surface_form;
    const baseForm = (token.basic_form && token.basic_form !== '*') ? token.basic_form : surface;
    const reading = token.reading ? escapeHtml(toHiragana(token.reading)) : '';
    const escapedSurface = escapeHtml(surface);
    const attrs = `data-base="${escapeHtml(baseForm)}" data-pos="${escapeHtml(token.pos ?? '')}"`;
    if (hasKanji(surface) && reading) {
      return `<span class="dusub-word" ${attrs}><ruby>${escapedSurface}<rt style="${rtStyle}">${reading}</rt></ruby></span>`;
    }
    const rdAttr = reading ? ` data-rd="${reading}"` : '';
    // Empty <rt> keeps kana aligned with furigana'd neighbours on the same line
    const inner = textHasKanji
      ? `<ruby>${escapedSurface}<rt style="${rtStyle}"></rt></ruby>`
      : escapedSurface;
    return `<span class="dusub-word" ${attrs}${rdAttr}>${inner}</span>`;
  }).join('');
}

// ── Tone sandhi helpers ────────────────────────────────────────────────────
/** Returns the tone number (1-5) of a pinyin syllable based on its diacritic mark. */
export function pinyinTone(py) {
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
 *  Pass 1 — cedict word-level lookup
 *  Pass 2 — 3rd+3rd sandhi
 *  Pass 3 — 一/不 sandhi
 * @param {string[]} chars
 * @param {string[]} pinyinArr
 * @returns {{ corrected: string[], correctedSet: Set<number> }}
 */
export function buildCorrectedPinyin(chars, pinyinArr) {
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

  // Pass 2: 3+3 sandhi
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
