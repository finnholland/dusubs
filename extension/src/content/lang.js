// @ts-check
import { browser, LOG, cfg } from './state.js';

// ── Language detection ─────────────────────────────────────────────────────
/** @param {string} code @returns {'zh' | 'ja' | 'en'} */
export function detectLang(code) {
  if (/^zh/i.test(code)) return 'zh';
  if (/^ja/i.test(code)) return 'ja';
  return 'en';
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
    const resp = await fetch(browser.runtime.getURL('vendor/cedict.json.gz'));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    hpfDict = await new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).json();
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

export function getKuromoji() { return kuromoji; }

/** @type {Record<string, { rd: string, en: string[], pos: string }> | null} */
let jaDict = null;
let jaDictLoading = false;

export function getJaDict() { return jaDict; }

export async function loadKuromoji() {
  if (kuromoji || kuromojiLoading) return;
  kuromojiLoading = true;
  const lib = globalThis.kuromoji;
  if (!lib?.builder) { kuromojiLoading = false; return; }

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
    const resp = await fetch(browser.runtime.getURL('vendor/ja-dict.json.gz'));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    jaDict = await new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).json();
    LOG('jaDict loaded:', Object.keys(jaDict).length, 'entries');
  } catch (e) {
    LOG('jaDict load failed:', e);
    jaDictLoading = false;
  }
}

export function toHiragana(katakana) {
  return (katakana || '').replace(/[ァ-ヶ]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

export function hasKanji(text) {
  return /[一-鿿㐀-䶿]/.test(text);
}

/** @param {{ baseForm: string, surface: string }} token */
export function lookupJapanese(token) {
  if (!jaDict) return null;
  return jaDict[token.baseForm] ?? jaDict[token.surface] ?? null;
}

/** @param {string} text @returns {string} */
export function renderJapanese(text) {
  if (!kuromoji) { loadKuromoji(); return escapeHtmlLang(text); }
  const tokens = kuromoji.tokenize(text);
  return tokens.map(token => {
    const surface = token.surface_form;
    const baseForm = (token.basic_form && token.basic_form !== '*') ? token.basic_form : surface;
    const reading = token.reading;
    const escapedSurface = escapeHtmlLang(surface);
    const escapedBase = escapeHtmlLang(baseForm);
    if (hasKanji(surface) && reading) {
      const hi = escapeHtmlLang(toHiragana(reading));
      const rtStyle = cfg.pinyinEnabled ? '' : 'visibility:hidden';
      return `<span class="dusub-word" data-base="${escapedBase}"><ruby>${escapedSurface}<rt style="${rtStyle}">${hi}</rt></ruby></span>`;
    }
    return hasKanji(text) ?
      `<span class="dusub-word" data-base="${escapedBase}"><ruby>${escapedSurface}<rt style="${cfg.pinyinEnabled ? '' : 'visibility:hidden'}"/></ruby></span>` :
      `<span class="dusub-word" data-base="${escapedBase}">${escapedSurface}</span>`;
  }).join('');
}

function escapeHtmlLang(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
