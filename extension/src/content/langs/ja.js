// @ts-check
import { browser, LOG, cfg } from '../state.js';
import { escapeHtml, lazyDict } from './shared.js';

/** @typedef {{ rd: string, rm?: string, en: string[], pos: string }} JaEntry */

/** Particles / auxiliaries: base form → [romaji, gloss]. Kuromoji gives these no dictionary entry. */
const JA_GRAMMAR = /** @type {Record<string, [string, string]>} */ ({
  'の': ['no', 'particle — possession / noun modification / nominalizer'],
  'に': ['ni', 'particle — location, time, direction, indirect object'],
  'を': ['wo', 'particle — direct object'],
  'は': ['wa', 'particle — topic marker'],
  'が': ['ga', 'particle — subject marker'],
  'で': ['de', 'particle — location of action, means, cause'],
  'と': ['to', 'particle — and / with / if (conditional) / quotation'],
  'も': ['mo', 'particle — also / too / even'],
  'へ': ['e', 'particle — direction (toward)'],
  'から': ['kara', 'particle — from / because'],
  'まで': ['made', 'particle — until / up to'],
  'より': ['yori', 'particle — than / from'],
  'か': ['ka', 'particle — question marker'],
  'ね': ['ne', 'particle — seeking agreement (right? / isn\'t it?)'],
  'よ': ['yo', 'particle — assertion / emphasis'],
  'ます': ['masu', 'auxiliary — polite verb ending'],
  'です': ['desu', 'auxiliary — polite copula (is / am / are)'],
  'た': ['ta', 'auxiliary — past tense'],
  'て': ['te', 'auxiliary — te-form connector'],
  'ない': ['nai', 'auxiliary — negation'],
  'ている': ['te iru', 'auxiliary — ongoing action / resultant state'],
});

const KUROMOJI_FILES = ['base', 'cc', 'check', 'tid', 'tid_pos', 'tid_map',
  'unk', 'unk_pos', 'unk_map', 'unk_char', 'unk_compat', 'unk_invoke'];

/** @type {any} */
let kuromoji = null;
let kuromojiLoading = false;

/** @type {ReturnType<typeof lazyDict<Record<string, JaEntry>>>} */
const dict = lazyDict('vendor/ja-dict.json.gz', 'ja-dict');

/**
 * Reverse index: hiragana reading → best entry, for when kuromoji returns a kana
 * basic_form (e.g. ほう for 方). Kanji-keyed entries win over kana-keyed ones since
 * they're more specific (方 beats 報 for reading ほう).
 * @type {Record<string, JaEntry> | null}
 */
let readingIndex = null;

/** @param {string} katakana */
function toHiragana(katakana) {
  return (katakana || '').replace(/[ァ-ヶ]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/** @param {string} text */
function hasKanji(text) {
  return /[一-鿿㐀-䶿]/.test(text);
}

async function loadKuromoji() {
  if (kuromoji || kuromojiLoading) return;
  kuromojiLoading = true;
  const lib = globalThis.kuromoji;
  if (!lib?.builder) { kuromojiLoading = false; return; }

  /** @type {Record<string, string>} */
  const blobs = {};
  await Promise.all(KUROMOJI_FILES.map(async name => {
    const res = await fetch(browser.runtime.getURL(`dict/${name}.dat.gz`));
    blobs[`${name}.dat.gz`] = URL.createObjectURL(await res.blob());
  }));

  // kuromoji fetches its dictionary over XHR; point those requests at the blob URLs.
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
    Object.values(blobs).forEach(URL.revokeObjectURL);
    LOG('kuromoji loaded ✓');
  } catch (e) {
    LOG('kuromoji load failed:', e);
    kuromojiLoading = false;
  } finally {
    XMLHttpRequest.prototype.open = origOpen;
  }
}

async function loadDict() {
  const entries = await dict.load();
  if (!entries || readingIndex) return;
  /** @type {Record<string, JaEntry>} */
  const index = {};
  for (const wantKanji of [true, false]) {
    for (const [key, entry] of Object.entries(entries)) {
      if (hasKanji(key) === wantKanji && !index[entry.rd]) index[entry.rd] = entry;
    }
  }
  readingIndex = index;
}

/** @param {string} text @returns {string} */
function render(text) {
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

/** @type {import('./index.js').LangModule} */
export default {
  load: () => Promise.all([loadKuromoji(), loadDict()]),
  render,
  hover(target) {
    const el = /** @type {HTMLElement | null} */ (target.closest('.dusub-word[data-base]'));
    if (!el) return null;
    const entries = dict.get();
    if (!entries) { loadDict(); return null; }
    const base = el.dataset.base ?? '';
    const pos = el.dataset.pos ?? '';
    if (pos === '助詞' || pos === '助動詞') {
      const [romaji, defs] = JA_GRAMMAR[base] ?? ['', pos === '助動詞' ? 'auxiliary verb ending' : 'particle'];
      return { result: { word: base, pinyin: romaji, defs }, anchor: el };
    }
    const entry = entries[base] ?? readingIndex?.[el.dataset.rd ?? ''];
    if (!entry) return null;
    const romaji = entry.rm || '';
    const reading = hasKanji(base)
      ? [entry.rd, romaji].filter(Boolean).join('  ')
      : romaji || entry.rd;
    const entryPos = entry.pos ? `[${entry.pos}] ` : '';
    return { result: { word: base, pinyin: reading, defs: entryPos + entry.en.join('; ') }, anchor: el };
  },
};
