#!/usr/bin/env node
// Builds a trimmed Spanish→English lookup from Wiktextract (kaikki.org)
// Usage: node scripts/build-es-dict.js [es-extract.jsonl[.gz]] [en-extract.jsonl]
// Input:  streamed from kaikki.org (or the local files given as arguments)
// Output: extension/vendor/es-dict.json.gz  { "hablar": { en, pos }, "habló": "hablar", ... }
//         (a string value points at the entry holding the definition)

const { jsonLines, writeVendorGzip } = require('./lib/dict-build');

// Spanish Wiktionary extract (glosses in Spanish, but has translations[] with lang_code:'en')
const KAIKKI_ES_URL = 'https://kaikki.org/dictionary/downloads/es/es-extract.jsonl.gz';
// English Wiktionary extract for Spanish words (glosses are in English directly)
const KAIKKI_EN_URL = 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl';

const POS_MAP = {
  'noun': 'n', 'verb': 'v', 'adj': 'adj', 'adv': 'adv',
  'prep': 'prep', 'conj': 'conj', 'intj': 'intj', 'pron': 'pron',
  'det': 'det', 'num': 'num', 'particle': 'part', 'article': 'art',
};

async function build(esSrc, enSrc) {
  const out = Object.create(null);
  const formOfPending = Object.create(null);

  // Pass 1a: Spanish Wiktionary — use translations[lang_code='en'] as definitions
  console.log('  Pass 1a: Spanish Wiktionary entries...');
  let total = 0;
  for await (const entry of jsonLines(esSrc, { gzip: esSrc.endsWith('.gz') })) {
    if (entry.lang_code !== 'es') continue;
    const word = entry.word;
    if (!word || out[word]) continue;

    const senses = entry.senses || [];
    const isFormOf = senses.length > 0 && senses.every(s => s.form_of && s.form_of.length > 0);
    if (isFormOf) {
      const lemma = senses[0].form_of?.[0]?.word;
      if (lemma && lemma !== word) formOfPending[word] = lemma;
      continue;
    }

    const en = (entry.translations || [])
      .filter(t => t.lang_code === 'en' && t.word && t.word.trim())
      .map(t => t.word.trim());
    if (!en.length) continue;

    const pos = POS_MAP[entry.pos] ?? entry.pos ?? '';
    out[word] = { en: en.slice(0, 3), pos };
    total++;
  }
  process.stdout.write(`\r  ${total} entries from Spanish Wiktionary\n`);

  // Pass 1b: English Wiktionary — glosses are already in English; fills gaps from pass 1a
  console.log('  Pass 1b: English Wiktionary entries...');
  let enTotal = 0;
  for await (const entry of jsonLines(enSrc)) {
    const word = entry.word;
    if (!word || out[word]) continue;

    const senses = entry.senses || [];
    const isFormOf = senses.length > 0 && senses.every(s => s.form_of && s.form_of.length > 0);
    if (isFormOf) {
      const lemma = senses[0].form_of?.[0]?.word;
      if (lemma && lemma !== word && !formOfPending[word]) formOfPending[word] = lemma;
      continue;
    }

    const glosses = senses.flatMap(s => s.glosses || [])
      .filter(g => typeof g === 'string' && g.trim() && !g.includes('{{') && !/^(misspelling|obsolete spelling|alternative spelling) of/i.test(g))
      .slice(0, 3);
    if (!glosses.length) continue;

    const pos = POS_MAP[entry.pos] ?? entry.pos ?? '';
    out[word] = { en: glosses, pos };
    enTotal++;
  }
  console.log(`  ${enTotal} additional entries from English Wiktionary`);

  // Pass 2: point form-of inflections at their lemma. A string value is a pointer to a
  // full entry, which keeps the file small (inflections vastly outnumber lemmas).
  console.log('  Pass 2: resolving inflections...');
  let resolved = 0;
  for (const [word, lemma] of Object.entries(formOfPending)) {
    if (out[word]) continue;
    if (typeof out[lemma] === 'object') { out[word] = lemma; resolved++; }
  }
  console.log(`  ${resolved} inflections resolved`);

  // Pass 3: accent-stripped aliases (also pointers, never pointer chains)
  const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  let aliased = 0;
  for (const word of Object.keys(out)) {
    const plain = strip(word);
    if (plain !== word && !out[plain]) {
      out[plain] = typeof out[word] === 'string' ? out[word] : word;
      aliased++;
    }
  }
  console.log(`  ${aliased} accent-stripped aliases added`);

  return out;
}

async function main() {
  // Optional local overrides: node scripts/build-es-dict.js [es-extract.jsonl[.gz]] [en-extract.jsonl]
  const esSrc = process.argv[2] ?? KAIKKI_ES_URL;
  const enSrc = process.argv[3] ?? KAIKKI_EN_URL;
  console.log('Building es-dict (streaming sources, nothing is saved to disk)...');
  writeVendorGzip('es-dict', await build(esSrc, enSrc));
}

main().catch(err => { console.error(err); process.exit(1); });
