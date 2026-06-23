# DuSub — sentLearning / sentNative Schema Plan

---

## Problem

Saved words currently capture sentence context using language-named fields
(`sentZh`, `sentEn`) which breaks down when:
- only one track is selected (the other field saves as empty string)
- the two tracks aren't Chinese/English (e.g. Chinese/Japanese dual subs)
- the "native" language isn't English (Japanese learner, Spanish learner, etc.)

## Solution

Replace language-named fields with **role-named** fields tied to `learnMode`:

```ts
interface SavedWord {
  ...
  sentLearning: string | null;  // sentence in the language being learned
  sentNative: string | null;    // sentence in the reference language
}
```

This makes the flashcard reveal logic language-agnostic forever — always
show `sentLearning` first, `sentNative` as the optional hint — regardless
of which two languages are actually on screen.

---

## 1. Determine Which Track Is "Learning"

`cfg.learnMode` already says which language is the focus (`'zh' | 'en' | 'ja'`).
Figure out whether that matches `track1` (top) or `track2` (bottom) using
the existing `detectLang` helper:

```js
const topIsLearning = ns.detectLang(cfg.track1 || '') === cfg.learnMode;
```

This is more robust than assuming top=learning always — handles the case
where a user has, say, Chinese on bottom and English on top.

---

## 2. Update `saveWord()` in `content/tooltip.js`

**Before:**
```js
const sentField = `sent${cfg.learnMode.charAt(0).toUpperCase()}${cfg.learnMode.slice(1)}`;
const entry = {
  [cfg.learnMode]: result.word, py: result.pinyin, en: trimDefinition(result.defs),
  [sentField]: lastTop, sentEn: lastBottom,
  url, language: cfg.learnMode, leitnerBox: 1, lastReviewed: null, nextReview: null
};
```

**After:**
```js
function saveWord(result) {
  const video = document.querySelector('video');
  const t = video ? video.currentTime - 2 : 0;
  const sep = location.href.includes('?') ? '&' : '?';
  const baseUrl = location.href.replace(/([&?])t=[^&]*/g, '').replace(/\?$/, '');
  const url = baseUrl + sep + 't=' + Math.floor(t);

  const topIsLearning = ns.detectLang(cfg.track1 || '') === cfg.learnMode;
  const sentLearning = topIsLearning ? renderState.lastTop : renderState.lastBottom;
  const sentNative   = topIsLearning ? renderState.lastBottom : renderState.lastTop;

  const entry = {
    [cfg.learnMode]: result.word,
    py: result.pinyin,
    en: trimDefinition(result.defs),
    sentLearning: sentLearning || null,
    sentNative: sentNative || null,
    url,
    language: cfg.learnMode,
    leitnerBox: 1,
    lastReviewed: null,
    nextReview: null,
  };

  browser.storage.local.get({ savedWords: {} }).then(({ savedWords }) => {
    savedWords[result.word] = entry;
    return browser.storage.local.set({ savedWords });
  }).then(() => {
    savedZh.add(result.word);
    const btn = tooltip.querySelector('.hpf-tip-save');
    if (btn) { btn.textContent = 'Saved ✓'; btn.classList.add('saved'); }
  }).catch(err => console.error('storage error:', err));
}
```

Note: using `|| null` rather than leaving as `''` so downstream consumers
(export, website) can cleanly distinguish "no sentence available" from
"empty string", and so `Array.filter(Boolean)` patterns work without
producing blank lines.

---

## 3. Update `web-bridge.js`

`DUSUBS_SAVE_WORD` handler should default missing fields the same way,
in case the website ever constructs a save payload independently:

```js
if (e.data.type === 'DUSUBS_SAVE_WORD') {
  const word = e.data.word;
  if (!word?.zh && !word?.ja && !word?.en) return;
  const { savedWords } = await browser.storage.local.get({ savedWords: {} });
  const key = word.zh || word.ja || word.en;
  savedWords[key] = {
    ...word,
    sentLearning: word.sentLearning ?? null,
    sentNative: word.sentNative ?? null,
    leitnerBox: word.leitnerBox ?? 1,
    lastReviewed: word.lastReviewed ?? null,
    nextReview: word.nextReview ?? null,
  };
  await browser.storage.local.set({ savedWords });
}
```

---

## 4. Migration for Already-Saved Words

Existing saved words have `sentZh`/`sentEn` (or similar) rather than
`sentLearning`/`sentNative`. Add a one-time migration alongside the
existing settings migration in the storage load:

```js
// in content.js, inside the browser.storage.local.get(...).then(s => { ... })
let savedWordsMigrated = false;
const savedWords = s.savedWords || {};
for (const key of Object.keys(savedWords)) {
  const w = savedWords[key];
  if (w.sentLearning === undefined) {
    // best-effort: assume whichever old field matches the word's own
    // language is "learning", the other is "native"
    const lang = w.language || 'zh';
    const oldLearningField = `sent${lang.charAt(0).toUpperCase()}${lang.slice(1)}`;
    w.sentLearning = w[oldLearningField] ?? null;
    w.sentNative = w.sentEn && oldLearningField !== 'sentEn' ? w.sentEn : (w.sentZh ?? null);
    delete w.sentZh; delete w.sentEn; delete w.sentJa;
    savedWordsMigrated = true;
  }
}
if (savedWordsMigrated) browser.storage.local.set({ savedWords });
```

This only needs to run once — words already migrated will have
`sentLearning` defined and get skipped on subsequent loads.

---

## 5. Website / Export Consumers

Anywhere `sentZh`/`sentEn` was read directly (Anki export, Quizlet export,
website flashcard view) needs updating to the new field names:

```js
// before
const back = [entry.py, entry.en, entry.sentEn].filter(Boolean).join('<br>');

// after
const back = [entry.py, entry.en, entry.sentNative].filter(Boolean).join('<br>');
const front = [entry.word, entry.sentLearning].filter(Boolean).join('<br>');
```

Flashcard reveal order becomes fixed regardless of language pair:
1. Show word + `sentLearning` (the prompt)
2. Reveal definition + `sentNative` (the answer/hint)

---

## 6. Type Update

```ts
interface SavedWord {
  language: 'zh' | 'ja' | 'en';
  word: string;
  py?: string;
  en: string;
  partOfSpeech?: string;
  sentLearning: string | null;
  sentNative: string | null;
  url: string;
  ts: number;
  savedAt: number;
  leitnerBox: 1 | 2 | 3 | 4 | 5;
  lastReviewed: number | null;
  nextReview: number | null;
}
```

Remove `sentZh`/`sentEn` from the type entirely once migration ships.

---

## Out of Scope

- Multi-language sentence storage beyond learning/native (e.g. trilingual)
- Retroactively fixing sentence data quality for already-migrated words