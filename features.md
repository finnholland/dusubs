## Overview

Add Japanese subtitle annotations using kuromoji.js for tokenisation and
furigana, plus JMdict for definitions. Everything runs client-side — no API
calls needed for core functionality.

Japanese is a natural second language after Chinese:
- Same ruby/annotation rendering concept (furigana above kanji = pinyin above hanzi)
- Learner overlap is high — many Chinese learners also study Japanese
- kuromoji.js handles both tokenisation AND readings in one library
- JMdict is clean and structured, no reverse-index problem

---

## 1. Libraries & Data

### kuromoji.js
Japanese tokeniser that runs in the browser. Returns each token with its
surface form and reading (in katakana).

Dictionary files (~8MB) are loaded from the extension's bundled assets.
Lazy-load only when `learnMode === 'ja'` to avoid unnecessary memory use.

Copy kuromoji dict files to an extension `/dict` folder at build time:
```bash
cp node_modules/kuromoji/dict/* dict/
```

### JMdict
Japanese-English dictionary. Use the `jmdict-simplified` project which
provides a clean JSON export — no raw XML parsing needed.

Repo: https://github.com/scriptin/jmdict-simplified

The full file is large (~60MB), so build a trimmed version at build time
(see section 3). Trimmed output should be ~5-8MB.

---

## 2. Tokenisation & Furigana

### Initialising kuromoji
```js
let kuromoji = null;

async function loadKuromoji() {
  if (kuromoji) return;
  const { default: kuromoji_builder } = await import('kuromoji');
  kuromoji = await new Promise((resolve, reject) => {
    kuromoji_builder({ dicPath: browser.runtime.getURL('dict/') })
      .build((err, tokenizer) => err ? reject(err) : resolve(tokenizer));
  });
}
```

Only call `loadKuromoji()` when `learnMode === 'ja'` is set.

### Tokenising a subtitle line
```js
function tokeniseJapanese(text) {
  return kuromoji.tokenize(text).map(token => ({
    surface: token.surface_form,        // the actual text e.g. 食べ
    reading: token.reading,             // katakana e.g. タベ
    baseForm: token.basic_form,         // dictionary form e.g. 食べる
    pos: token.part_of_speech,          // 名詞, 動詞, 助詞 etc.
  }));
}
```

### Katakana → Hiragana conversion
kuromoji returns readings in katakana. Convert to hiragana for display
(more natural for furigana):

```js
function toHiragana(katakana) {
  return katakana.replace(/[\u30A1-\u30F6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}
```

### Skip furigana when not needed
Don't show furigana above hiragana/katakana-only tokens or punctuation —
only above tokens that contain kanji:

```js
function hasKanji(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}
```

---

## 3. JMdict Build Script

Trim JMdict at build time to reduce bundle size.
Keep only: kanji form, reading, first 3 English definitions, part of speech.

Create `scripts/build-ja-dict.js`:

```js
#!/usr/bin/env node
// Builds a trimmed JMdict lookup from jmdict-english.json
// Usage: node scripts/build-ja-dict.js
// Output: ja-dict.json  { "食べる": { rd, en, pos }, ... }

const fs = require('fs');
const jmdict = require('./jmdict-english.json');

const out = Object.create(null);

for (const entry of jmdict.words) {
  const defs = entry.sense
    .slice(0, 3)
    .flatMap(s => s.gloss.map(g => g.text))
    .slice(0, 3);

  if (!defs.length) continue;

  const pos = entry.sense[0]?.partOfSpeech?.[0] ?? '';

  // Index by all kanji forms
  for (const k of entry.kanji) {
    out[k.text] = {
      rd: entry.kana[0]?.text ?? '',   // primary reading (hiragana)
      en: defs,
      pos,
    };
  }

  // Also index by kana alone (for kana-only words)
  for (const k of entry.kana) {
    if (!out[k.text]) {
      out[k.text] = { rd: k.text, en: defs, pos };
    }
  }
}

fs.writeFileSync('./ja-dict.json', JSON.stringify(out));
const mb = (fs.statSync('./ja-dict.json').size / 1024 / 1024).toFixed(1);
console.log(`Built Japanese dict: ${Object.keys(out).length} entries (${mb} MB)`);
```

Add to `package.json`:
```json
"build:ja-dict": "node scripts/build-ja-dict.js"
```

---

## 4. Definition Lookup

Use `baseForm` from kuromoji token to look up in `ja-dict.json`:

```js
let jaDict = {};

async function loadJaDict() {
  const url = browser.runtime.getURL('ja-dict.json');
  const res = await fetch(url);
  jaDict = await res.json();
}

function lookupJapanese(token) {
  // try base form first (dictionary form), fall back to surface
  return jaDict[token.baseForm] ?? jaDict[token.surface] ?? null;
}
```

Add `ja-dict.json` to `web_accessible_resources` in manifest.

---

## 5. Prefetch

Same pattern as Chinese — on `timeupdate`, tokenise upcoming Japanese cues
and warm the in-memory lookup (ja-dict is already local so this is just
ensuring kuromoji has processed the tokens ahead of time):

```js
const jaCache = new Map(); // surface → definition

function prefetchUpcomingJapanese() {
  if (settings.learnMode !== 'ja') return;
  const cues = getUpcomingCues('ja', 5);
  for (const cue of cues) {
    const tokens = tokeniseJapanese(cue.text);
    for (const token of tokens) {
      if (!jaCache.has(token.baseForm) && hasKanji(token.surface)) {
        jaCache.set(token.baseForm, lookupJapanese(token));
      }
    }
  }
}

video.addEventListener('timeupdate', prefetchUpcomingJapanese);
```

---

## 6. Rendering

### Furigana above kanji (ruby)
Each subtitle token becomes either plain text or a ruby element:

```js
function renderJapaneseToken(token) {
  const span = document.createElement('span');
  span.className = 'dusub-word';
  span.dataset.base = token.baseForm;

  if (hasKanji(token.surface) && token.reading) {
    const ruby = document.createElement('ruby');
    ruby.textContent = token.surface;
    const rt = document.createElement('rt');
    rt.textContent = toHiragana(token.reading);
    ruby.appendChild(rt);
    span.appendChild(ruby);
  } else {
    span.textContent = token.surface;
  }

  return span;
}
```

### Furigana toggle
Respect the existing `pinyinEnabled` toggle — for Japanese, wire this same
toggle to show/hide furigana (same concept, different name in UI):

```js
// in popup, when learnMode === 'ja', label the toggle "Furigana" not "Pinyin"
const label = settings.learnMode === 'ja' ? 'Furigana' : 'Pinyin';
```

---

## 7. Tooltip

Reuse existing tooltip with Japanese layout:

```
┌──────────────────────────────┐
│ 食べる   たべる               │
│ verb                         │
│ to eat; to live on           │
│                    [Save]    │
└──────────────────────────────┘
```

- Show kana reading (hiragana) next to the word
- Show part of speech
- Show up to 3 definitions
- Only active when `learnMode === 'ja'`

---

## 8. Saving

Same `SavedWord` shape — `language: 'ja'`:

```ts
{
  language: 'ja',
  word: '食べる',       // base form
  py: 'たべる',         // reading (reuse py field)
  en: 'to eat',        // first definition
  sentZh: '...',       // source subtitle (ja in this case, field name is legacy)
  sentEn: '...',
  url,
  ts,
  savedAt,
}
```

Anki export: front = word + furigana, back = reading + definitions.

---

## 9. Learn Mode Cycle Update

Add `ja` to the cycle in `content.js` and popup:

```
none → zh → ja → none → ...
```

Popup cycle button labels:
- `none` → "Off"
- `zh` → "🇨🇳 Chinese"
- `ja` → "🇯🇵 Japanese"

Show furigana toggle (labelled "Furigana") and hover toggle when `learnMode === 'ja'`.
Hide sandhi toggle (Chinese only).

---

## 10. Build Steps Summary

```bash
# 1. Install kuromoji
npm install kuromoji

# 2. Copy dict files
cp node_modules/kuromoji/dict/* dict/

# 3. Download jmdict-simplified JSON
# from https://github.com/scriptin/jmdict-simplified/releases
# place as scripts/jmdict-english.json

# 4. Build trimmed dict
node scripts/build-ja-dict.js

# 5. Commit ja-dict.json and dict/ folder
```

---

## Out of Scope

- Romaji display (hiragana is standard for learners)
- Pitch accent
- JLPT level tagging (useful later, add to build script)
- Spanish / French (same API-based pattern, separate plan)