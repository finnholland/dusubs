## 1. Learn Mode Cycle

Above the track selection add a learn mode cycle. Simple, minimal UI.

### States
```
none → en → zh → none → ...
```
- `none` — plain dual subtitles, no annotations, hover disabled
- `en` — learning English, English subtitle gets hover + definitions
- `zh` — learning Chinese, Chinese subtitle gets pinyin, sandhi, hover + definitions

Add more languages here later (ja, es, fr) when language support is added.

### Settings shape
```js
{
  learnMode: 'none' | 'en' | 'zh',  // default: 'none'
  pinyinEnabled: true,               // only relevant when learnMode === 'zh'
  sandhiEnabled: true,               // only relevant when learnMode === 'zh'
}
```

### Popup UI

```
┌─────────────────────────────┐
│  Learn mode:  [ 🇨🇳 Chinese ] ← clickable, cycles none → en → zh
│                             │
│  (shown only when learnMode !== 'none')
│  [✓] Pinyin                 │  ← zh only
│  [✓] Sandhi colours         │  ← zh only
└─────────────────────────────┘
```

- When `learnMode === 'none'`: just show the cycle button labelled "Off", hide all toggles
- When `learnMode === 'en'`: show hover toggle only (no pinyin/sandhi for English)
- When `learnMode === 'zh'`: show pinyin, sandhi, hover toggles
- Cycle button label reflects current state: "Off" / "🇬🇧 English" / "🇨🇳 Chinese"

### In content.js
```js
const isLearning = settings.learnMode !== 'none';
const learningZh = settings.learnMode === 'zh';

// hover only active when learning
if (!isLearning) return;

// pinyin/sandhi only for zh
if (learningZh && settings.pinyinEnabled) addPinyin();
if (learningZh && settings.sandhiEnabled) addSandhi();
```

---

## 2. Auto-Start

The extension should activate on supported pages without the popup ever being opened.

### Fix
In `content.js`, load settings with defaults on script start:
```js
browser.storage.local.get({
  learnMode: 'none',
  pinyinEnabled: true,
  sandhiEnabled: true,
}).then(settings => {
  init(settings);
});
```

- Popup is purely a settings UI that writes to storage
- `content.js` listens for storage changes and updates live:
```js
browser.storage.onChanged.addListener((changes) => {
  Object.keys(changes).forEach(key => {
    settings[key] = changes[key].newValue;
  });
  applySettings();
});
```

---

## 3. Popup Links

Add two small icon links to the bottom of the popup:

- **GitHub** — links to the repo (get origin)
- **Website** — links to `https://www.dusubs.com`

Subtle — small icons or plain text at the very bottom, below all controls:
```
[GitHub]  [dusubs.com]
```

Use inline SVG for GitHub icon and a globe icon. No extra dependencies.

---

## 4. Other Small Fixes

### Save button reset
After saving, button shows "Saved ✓" but never resets on re-hover. Reset on tooltip hide:
```js
btn.textContent = 'Save';
btn.classList.remove('saved');
```

### Tooltip z-index
Set `z-index: 2147483647` on the tooltip so it always appears above YouTube UI.

### Popup version number
Show version in popup footer from manifest:
```js
const { version } = browser.runtime.getManifest();
```
Display as small muted text e.g. `v1.0.0` next to the links.

### Empty state for saved words
If `savedWords` is empty, show: "Hover a word while watching to save it."

---

## Out of Scope for This Pass
- SRS / spaced repetition
- Language additions beyond en/zh
- Website sync