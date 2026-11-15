// @ts-check
// Standalone, dependency-free so it can be shared by both the content script
// bundle (content/*.js) and the popup bundle (popup.tsx).

/** @typedef {'zh' | 'ja' | 'es'} LearnLang */

/**
 * Static per-language metadata. `readingLabel` is the popup label for the reading toggle
 * (null = no reading support); `sandhi` enables the tone-colour toggle; `cjk` picks CJK subtitle styling.
 * @type {Record<LearnLang, { label: string, cjk: boolean, readingLabel: string | null, sandhi: boolean }>}
 */
export const LANG_META = {
  zh: { label: '中 Chinese', cjk: true, readingLabel: 'Pinyin', sandhi: true },
  ja: { label: '日 Japanese', cjk: true, readingLabel: 'Furigana', sandhi: false },
  es: { label: 'ES Spanish', cjk: false, readingLabel: null, sandhi: false },
};

/** @param {string} code @returns {LearnLang | 'en'} */
export function detectLang(code) {
  if (/^zh/i.test(code)) return 'zh';
  if (/^ja/i.test(code)) return 'ja';
  if (/^es/i.test(code)) return 'es';
  return 'en';
}

/**
 * Derives which language learn mode is actually studying, based on the
 * currently selected tracks — top (track1) wins if both are learnable.
 * Returns null when learn mode is off or neither track is zh/ja/es.
 * @param {{ learnEnabled: boolean, track1: string, track2: string }} c
 * @returns {LearnLang | null}
 */
export function getActiveLearnLang(c) {
  if (!c.learnEnabled) return null;
  for (const code of [c.track1, c.track2]) {
    const lang = detectLang(code || '');
    if (lang !== 'en') return lang;
  }
  return null;
}
