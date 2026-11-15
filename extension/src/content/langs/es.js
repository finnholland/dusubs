// @ts-check
import { escapeHtml, lazyDict } from './shared.js';

/** @typedef {{ en: string[], pos: string }} EsEntry */

/** A string value points at the entry holding the definition (inflections, accent-less spellings). */
/** @type {ReturnType<typeof lazyDict<Record<string, EsEntry | string>>>} */
const dict = lazyDict('vendor/es-dict.json.gz', 'es-dict');

/** @param {Record<string, EsEntry | string>} entries @param {string} word @returns {EsEntry | null} */
function lookup(entries, word) {
  for (const key of [word, word.toLowerCase()]) {
    const hit = entries[key];
    const entry = typeof hit === 'string' ? entries[hit] : hit;
    if (entry && typeof entry === 'object') return entry;
  }
  return null;
}

const PUNCT = '¡!¿?.,;:"\'“”‘’«»—\\-()';
const SPLIT = new RegExp(`(\\s+|[${PUNCT}])`);
const ONLY_SEPARATORS = new RegExp(`^[\\s${PUNCT}]+$`);

/** @param {string} text @returns {string} */
function render(text) {
  if (!text) return '';
  // Split on whitespace and punctuation, keeping delimiters as separate tokens
  return text.split(SPLIT).map(tok => {
    if (!tok) return '';
    const escaped = escapeHtml(tok);
    if (ONLY_SEPARATORS.test(tok)) return escaped;
    return `<span class="dusub-word" data-base="${escaped}">${escaped}</span>`;
  }).join('');
}

/** @type {import('./index.js').LangModule} */
export default {
  load: () => dict.load(),
  render,
  hover(target) {
    const wordSpan = /** @type {HTMLElement | null} */ (target.closest('.dusub-word[data-base]'));
    if (!wordSpan) return null;
    const entries = dict.get();
    if (!entries) { dict.load(); return null; }
    const word = wordSpan.dataset.base ?? '';
    const entry = lookup(entries, word);
    if (!entry) return null;
    const pos = entry.pos ? `[${entry.pos}] ` : '';
    return { result: { word, pinyin: '', defs: pos + entry.en.join('; ') }, anchor: wordSpan };
  },
};
