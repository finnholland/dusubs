#!/usr/bin/env node
// Builds a trimmed JMdict lookup from jmdict-english.json
// Usage: node scripts/build-ja-dict.js
// Input:  scripts/jmdict-english.json  (from https://github.com/scriptin/jmdict-simplified/releases)
// Output: ja-dict.json  { "食べる": { rd, en, pos }, ... }

const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'jmdict-english.json');
if (!fs.existsSync(inputPath)) {
  console.error('Missing scripts/jmdict-english.json');
  console.error('Download from https://github.com/scriptin/jmdict-simplified/releases');
  process.exit(1);
}

const jmdict = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const out = Object.create(null);

for (const entry of jmdict.words) {
  const defs = entry.sense
    .slice(0, 3)
    .flatMap(s => s.gloss.map(g => g.text))
    .slice(0, 3);

  if (!defs.length) continue;

  const pos = entry.sense[0]?.partOfSpeech?.[0] ?? '';

  for (const k of entry.kanji) {
    out[k.text] = { rd: entry.kana[0]?.text ?? '', en: defs, pos };
  }

  for (const k of entry.kana) {
    if (!out[k.text]) {
      out[k.text] = { rd: k.text, en: defs, pos };
    }
  }
}

const outPath = path.join(__dirname, '..', 'ja-dict.json');
fs.writeFileSync(outPath, JSON.stringify(out));
const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
console.log(`Built ja-dict.json: ${Object.keys(out).length} entries (${mb} MB)`);
