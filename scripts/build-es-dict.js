#!/usr/bin/env node
// Builds a trimmed Spanish→English lookup from Wiktextract (kaikki.org)
// Usage: node scripts/build-es-dict.js
// Input:  scripts/kaikki-es.jsonl  (downloaded automatically if missing)
// Output: extension/vendor/es-dict.json  { "hablar": { en, pos }, ... }

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');

// Spanish Wiktionary extract (glosses in Spanish, but has translations[] with lang_code:'en')
const KAIKKI_ES_URL = 'https://kaikki.org/dictionary/downloads/es/es-extract.jsonl.gz';
// English Wiktionary extract for Spanish words (glosses are in English directly)
const KAIKKI_EN_URL = 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'dusubs-build' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpsGet(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      resolve(res);
    }).on('error', reject);
  });
}

async function downloadGzipped(url, destPath) {
  const res = await httpsGet(url);
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    res.pipe(gunzip);
    const out = fs.createWriteStream(destPath);
    gunzip.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    gunzip.on('error', reject);
  });
}

async function downloadPlain(url, destPath) {
  const res = await httpsGet(url);
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

const POS_MAP = {
  'noun': 'n', 'verb': 'v', 'adj': 'adj', 'adv': 'adv',
  'prep': 'prep', 'conj': 'conj', 'intj': 'intj', 'pron': 'pron',
  'det': 'det', 'num': 'num', 'particle': 'part', 'article': 'art',
};

async function readLines(inputPath) {
  const entries = [];
  const rl = readline.createInterface({ input: fs.createReadStream(inputPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch { }
  }
  return entries;
}

async function build(esPath, enPath) {
  const out = Object.create(null);
  const formOfPending = Object.create(null);

  // Pass 1a: Spanish Wiktionary — use translations[lang_code='en'] as definitions
  console.log('  Pass 1a: Spanish Wiktionary entries...');
  const esEntries = await readLines(esPath);
  let total = 0;
  for (const entry of esEntries) {
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
  const enEntries = await readLines(enPath);
  let enTotal = 0;
  for (const entry of enEntries) {
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

  // Pass 2: resolve form-of inflections to their lemma
  console.log('  Pass 2: resolving inflections...');
  let resolved = 0;
  for (const [word, lemma] of Object.entries(formOfPending)) {
    if (out[word]) continue;
    if (out[lemma]) { out[word] = out[lemma]; resolved++; }
  }
  console.log(`  ${resolved} inflections resolved`);

  // Pass 3: accent-stripped aliases
  const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  let aliased = 0;
  for (const word of Object.keys(out)) {
    const plain = strip(word);
    if (plain !== word && !out[plain]) { out[plain] = out[word]; aliased++; }
  }
  console.log(`  ${aliased} accent-stripped aliases added`);

  return out;
}

async function main() {
  const esPath = path.join(__dirname, 'kaikki-es.jsonl');
  const enPath = path.join(__dirname, 'kaikki-en-es.jsonl');

  if (!fs.existsSync(esPath)) {
    console.log('Downloading Spanish Wiktionary extract...');
    await downloadGzipped(KAIKKI_ES_URL, esPath);
    console.log('Done.');
  }
  if (!fs.existsSync(enPath)) {
    console.log('Downloading English Wiktionary Spanish extract...');
    await downloadPlain(KAIKKI_EN_URL, enPath);
    console.log('Done.');
  }

  console.log('Building es-dict.json...');
  const dict = await build(esPath, enPath);

  const outPath = path.join(__dirname, '..', 'extension/vendor/es-dict.json');
  fs.writeFileSync(outPath, JSON.stringify(dict));
  // fs.unlinkSync(inputPath);
  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`Built es-dict.json: ${Object.keys(dict).length} entries (${mb} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
