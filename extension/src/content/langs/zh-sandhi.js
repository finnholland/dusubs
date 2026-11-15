// @ts-check
// Mandarin tone sandhi on top of pinyin-pro's per-character output.

/** Returns the tone number (1-5) of a pinyin syllable based on its diacritic mark. @param {string} py */
function pinyinTone(py) {
  if (/[āēīōūǖ]/.test(py)) return 1;
  if (/[áéíóúǘ]/.test(py)) return 2;
  if (/[ǎěǐǒǔǚ]/.test(py)) return 3;
  if (/[àèìòùǜ]/.test(py)) return 4;
  return 5;
}

/** @type {Record<string, string>} */
const T3_TO_T2 = { 'ǎ': 'á', 'ě': 'é', 'ǐ': 'í', 'ǒ': 'ó', 'ǔ': 'ú', 'ǚ': 'ǘ' };
/** @type {Record<string, string>} */
const T1_TO_T2 = { 'ā': 'á', 'ē': 'é', 'ī': 'í', 'ō': 'ó', 'ū': 'ú', 'ǖ': 'ǘ' };
/** @type {Record<string, string>} */
const T1_TO_T4 = { 'ā': 'à', 'ē': 'è', 'ī': 'ì', 'ō': 'ò', 'ū': 'ù', 'ǖ': 'ǜ' };
/** @type {Record<string, string>} */
const T4_TO_T2 = { 'à': 'á', 'è': 'é', 'ì': 'í', 'ò': 'ó', 'ù': 'ú', 'ǜ': 'ǘ' };
/** @param {string} py */
function tone3to2(py) { return py.replace(/[ǎěǐǒǔǚ]/g, c => T3_TO_T2[c]); }
/** @param {string} py */
function tone1to2(py) { return py.replace(/[āēīōūǖ]/g, c => T1_TO_T2[c]); }
/** @param {string} py */
function tone1to4(py) { return py.replace(/[āēīōūǖ]/g, c => T1_TO_T4[c]); }
/** @param {string} py */
function tone4to2(py) { return py.replace(/[àèìòùǜ]/g, c => T4_TO_T2[c]); }

/**
 * Applies all standard Mandarin tone sandhi rules:
 *  Pass 1 — cedict word-level lookup
 *  Pass 2 — 3rd+3rd sandhi
 *  Pass 3 — 一/不 sandhi
 * @param {string[]} chars
 * @param {string[]} pinyinArr
 * @param {Record<string, [string, string]>} dict cedict: word → [pinyin, defs]
 * @returns {{ corrected: string[], correctedSet: Set<number> }}
 */
export function buildCorrectedPinyin(chars, pinyinArr, dict) {
  const result = pinyinArr.slice();
  /** @type {Set<number>} */
  const correctedSet = new Set();

  // Pass 1: cedict word-level lookup (corrects neutral tones)
  let i = 0;
  while (i < chars.length) {
    let matched = false;
    for (let len = Math.min(8, chars.length - i); len >= 2; len--) {
      const entry = dict[chars.slice(i, i + len).join('')];
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
