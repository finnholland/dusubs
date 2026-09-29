// @ts-check
// Standalone, dependency-free so it can be shared by both the content script
// bundle (content/lang.js) and the popup bundle (popup.tsx).

/** @param {string} code @returns {'zh' | 'ja' | 'en'} */
export function detectLang(code) {
  if (/^zh/i.test(code)) return 'zh';
  if (/^ja/i.test(code)) return 'ja';
  return 'en';
}

/**
 * Derives which language learn mode is actually studying, based on the
 * currently selected tracks — top (track1) wins if both are zh/ja.
 * Returns null when learn mode is off or neither track is zh/ja.
 * @param {{ learnEnabled: boolean, track1: string, track2: string }} c
 * @returns {'zh' | 'ja' | null}
 */
export function getActiveLearnLang(c) {
  if (!c.learnEnabled) return null;
  const topLang = detectLang(c.track1 || '');
  if (topLang === 'zh' || topLang === 'ja') return topLang;
  const bottomLang = detectLang(c.track2 || '');
  if (bottomLang === 'zh' || bottomLang === 'ja') return bottomLang;
  return null;
}
