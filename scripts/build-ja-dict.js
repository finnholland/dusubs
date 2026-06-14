#!/usr/bin/env node
// Builds a trimmed JMdict lookup from jmdict-english.json
// Usage: node scripts/build-ja-dict.js
// Input:  scripts/jmdict-english.json  (downloaded automatically from scriptin/jmdict-simplified if missing)
// Output: extension/vendor/ja-dict.json  { "食べる": { rd, en, pos }, ... }

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

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

async function fetchJson(url) {
  const res = await httpsGet(url);
  return new Promise((resolve, reject) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(JSON.parse(data)));
    res.on('error', reject);
  });
}

async function downloadFile(url, dest) {
  const res = await httpsGet(url);
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function downloadJmdict(inputPath) {
  console.log('Fetching latest JMdict release info...');
  const release = await fetchJson('https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest');
  const asset = release.assets.find(a => /^jmdict-eng-[\d].*\.json\.tgz$/.test(a.name));
  if (!asset) throw new Error('Could not find jmdict-eng asset in latest release');

  console.log(`Downloading ${asset.name}...`);
  const tmpFile = path.join(os.tmpdir(), asset.name);
  await downloadFile(asset.browser_download_url, tmpFile);

  console.log('Extracting...');
  execSync(`tar -xzf "${tmpFile}" -C "${__dirname}"`, { stdio: 'inherit' });
  fs.unlinkSync(tmpFile);

  const extracted = fs.readdirSync(__dirname).find(f => f.startsWith('jmdict-eng') && f.endsWith('.json'));
  if (!extracted) throw new Error('Could not find extracted jmdict JSON file');
  fs.renameSync(path.join(__dirname, extracted), inputPath);
  console.log('JMdict ready.');
}


const HIRAGANA_TO_ROMAJI = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'di', 'づ': 'du', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  // compound kana — must be checked before single kana
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  'っ': '', // double next consonant — handled separately
  'ー': '-',
};

function toRomaji(hiragana) {
  let result = '';
  let i = 0;
  while (i < hiragana.length) {
    const isLast = i === hiragana.length - 1;
    // は/へ as word-final particles
    if (isLast && hiragana[i] === 'は') { result += 'wa'; i++; continue; }
    if (isLast && hiragana[i] === 'へ') { result += 'e'; i++; continue; }
    // try compound (2-char) first
    const two = hiragana.slice(i, i + 2);
    if (HIRAGANA_TO_ROMAJI[two]) {
      result += HIRAGANA_TO_ROMAJI[two];
      i += 2;
    } else if (hiragana[i] === 'っ') {
      // double the next consonant
      const next = HIRAGANA_TO_ROMAJI[hiragana.slice(i + 1, i + 3)]
        ?? HIRAGANA_TO_ROMAJI[hiragana[i + 1]]
        ?? '';
      result += next[0] ?? '';
      i++;
    } else {
      result += HIRAGANA_TO_ROMAJI[hiragana[i]] ?? hiragana[i];
      i++;
    }
  }
  return result;
}

async function main() {
  const inputPath = path.join(__dirname, 'jmdict-english.json');
  if (!fs.existsSync(inputPath)) await downloadJmdict(inputPath);

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
      const rd = entry.kana[0]?.text ?? '';
      out[k.text] = { rd, rm: toRomaji(rd), en: defs, pos };
    }

    for (const k of entry.kana) {
      if (!out[k.text]) {
        out[k.text] = { rd: k.text, rm: toRomaji(k.text), en: defs, pos };
      }
    }
  }

  const outPath = path.join(__dirname, '..', 'extension/vendor/ja-dict.json');
  fs.writeFileSync(outPath, JSON.stringify(out));
  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`Built ja-dict.json: ${Object.keys(out).length} entries (${mb} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
