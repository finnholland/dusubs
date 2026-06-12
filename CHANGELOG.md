# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.0.0] — 2026-06-12 — Initial Release

### Extension

**Chinese & Japanese subtitle annotations**
- Pinyin displayed above Chinese characters using `<ruby>` tags, powered by [pinyin-pro](https://github.com/zh-lx/pinyin-pro)
- Furigana (hiragana readings) displayed above Japanese characters, powered by [kuromoji](https://github.com/takuyaa/kuromoji)
- Toggle annotations on/off to self-test, then reveal on demand

**Dual-track subtitles**
- Choose any two caption tracks from a video's available captions independently (e.g. Chinese on top, English below)
- Works on YouTube and Bilibili

**Hover to look up**
- Hover any word to see its reading and dictionary definitions in a tooltip
- Chinese definitions sourced from CC-CEDICT (`cedict.json`)
- Japanese definitions sourced from JMdict (`ja-dict.json`)

**One-tap save**
- Click any word to save it to your word list with full sentence context
- Saved words sync to [dusubs.com](https://www.dusubs.com) via the web bridge

**Visual customisation**
- Per-track colour (white, yellow, pink, blue, green)
- Font scale slider
- Overlay position slider
- Stroke, window backdrop, and drop shadow toggles

**Browser support**
- Firefox (MV2) — distributed via [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/dusubs/)
- Chrome/Edge (MV3) — available as a zip for manual installation

### Website — [dusubs.com](https://www.dusubs.com)

- **Saved word dashboard** — browse and manage all words saved while watching
- **Flashcard review** — flip cards showing character, reading, and definition
- **Leitner spaced repetition** — 5-box SRS with intervals of 1, 2, 4, 8, and 16 days; correct promotes, wrong resets to box 1
- **Language filter** — study Chinese, Japanese, or both together
- **Export** — download your word list in Anki or Quizlet format
