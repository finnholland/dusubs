#!/usr/bin/env node
// Downloads CC-CEDICT and writes cedict.json to the extension root.
//
// Usage:
//   node scripts/make-dict.js              — download from mdbg.net
//   node scripts/make-dict.js cedict.txt   — use local uncompressed file
//
// Output: cedict.json  (format: { "word": ["pīn yīn", "def1; def2"] })

'use strict';

const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const OUT = path.join(__dirname, '..', 'extension/vendor/cedict.json');
const CEDICT_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';

// ── Tone-mark conversion ───────────────────────────────────────────────────
// CEDICT uses numeric tones: ni3 hao3 → nǐ hǎo

const TONE_MAP = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

function markSyllable(syl, tone) {
  // Normalize u: → v (CEDICT uses u: for ü)
  syl = syl.replace('u:', 'v');
  const t = (tone >= 1 && tone <= 5) ? tone - 1 : 4;
  // Standard rule: a or e always takes the mark
  for (const v of ['a', 'e']) {
    if (syl.includes(v)) return syl.replace(v, TONE_MAP[v][t]);
  }
  // ou: o takes the mark
  if (syl.includes('ou')) return syl.replace('o', TONE_MAP.o[t]);
  // Otherwise last vowel takes the mark
  const match = syl.match(/[aeiouv](?=[^aeiouv]*$)/);
  if (match) {
    const v = match[0];
    const marked = TONE_MAP[v]?.[t];
    if (marked) return syl.slice(0, match.index) + marked + syl.slice(match.index + 1);
  }
  // Neutral tone / no vowel (e.g. "r"): just strip number, fix v→ü
  return syl.replace(/v/g, 'ü');
}

function pinyinToMarks(raw) {
  return raw.replace(/([a-züv:]+)([1-5])/gi, (_, syl, n) =>
    markSyllable(syl.toLowerCase(), parseInt(n, 10))
  );
}

// ── Line parser ────────────────────────────────────────────────────────────
// CEDICT format:  Traditional Simplified [pin1 yin1] /def1/def2/

function parseLine(line) {
  if (!line || line.startsWith('#')) return null;
  const m = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/);
  if (!m) return null;
  const [, trad, simp, rawPy, rawDefs] = m;
  return {
    trad,
    simp,
    pinyin: pinyinToMarks(rawPy),
    defs: rawDefs.replace(/\//g, '; '),
  };
}

// ── Build ──────────────────────────────────────────────────────────────────

async function build(inputStream) {
  const dict = Object.create(null);
  const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });
  let count = 0;

  for await (const line of rl) {
    const entry = parseLine(line);
    if (!entry) continue;
    const val = [entry.pinyin, entry.defs];
    if (!dict[entry.simp]) dict[entry.simp] = val;
    if (entry.trad !== entry.simp && !dict[entry.trad]) dict[entry.trad] = val;
    count++;
    if (count % 10000 === 0) process.stdout.write(`\r  ${count} entries parsed...`);
  }

  process.stdout.write(`\r  ${count} entries parsed — writing ${path.basename(OUT)}\n`);
  fs.writeFileSync(OUT, JSON.stringify(dict));
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log(`  done. ${mb} MB written to ${OUT}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

const localFile = process.argv[2];

if (localFile) {
  console.log(`Reading ${localFile} ...`);
  build(fs.createReadStream(path.resolve(localFile)));
} else {
  console.log(`Downloading CC-CEDICT from mdbg.net ...`);
  const request = (url, cb) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        request(res.headers.location, cb);
      } else {
        cb(res);
      }
    }).on('error', e => { console.error('Download failed:', e.message); process.exit(1); });
  };

  request(CEDICT_URL, (res) => {
    if (res.statusCode !== 200) {
      console.error('HTTP', res.statusCode); process.exit(1);
    }
    const gunzip = zlib.createGunzip();
    res.pipe(gunzip);
    build(gunzip);
  });
}
