// @ts-check
import zh from './zh.js';
import ja from './ja.js';
import es from './es.js';

/**
 * Per-language behaviour for learn mode. Static metadata (labels, CJK, reading support)
 * lives in LANG_META in ../detect-lang.js so the popup can use it without these deps.
 * To add a language: add a module here, an entry in LANGS, and an entry in LANG_META.
 * @typedef {{ word: string, pinyin: string, defs: string }} HoverResult
 * @typedef {{
 *   load: () => Promise<unknown>,
 *   render: (text: string) => string,
 *   hover: (target: Element, ctx: { box: HTMLElement, text: string }) => { result: HoverResult, anchor: Element } | null,
 * }} LangModule
 */

/** @type {Record<import('../detect-lang.js').LearnLang, LangModule>} */
const LANGS = { zh, ja, es };

/** @param {import('../detect-lang.js').LearnLang} code */
export function getLang(code) {
  return LANGS[code];
}
