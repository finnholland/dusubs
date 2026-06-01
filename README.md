# Hanzi Pinyin Subtitles

A browser extension that overlays Chinese subtitles with pinyin readings above each character on YouTube and Bilibili. A second subtitle track (e.g. English) can be shown below simultaneously.

## What it looks like

The extension renders a floating overlay directly on the video. The top line annotates every Chinese character with its pinyin reading using HTML5 `<ruby>` tags, powered by the bundled `pinyin-pro` library. The bottom line shows a secondary track (typically English) in a smaller size beneath.

## Features

- **Dual-track subtitles** — pick any two tracks from the video's available captions independently
- **Live pinyin annotation** — pinyin is computed at runtime by `pinyin-pro` and rendered above each character using `<ruby>`/`<rt>` tags
- **Pinyin toggle** — hide pinyin and show bare characters when you want to test yourself
- **Per-track colour** — white, yellow, pink, blue, or green per track
- **Font scale & position** — resize and reposition the overlay with sliders
- **Stroke / Window / Shadow** — visual style toggles for readability
- **YouTube & Bilibili** — works on both platforms

## How it works

| File | World | Role |
|---|---|---|
| `youtube-main.js` | MAIN | Accesses YouTube's internal player API to read available caption tracks and their URLs |
| `pinyin-pro.js` | ISOLATED | Bundled [pinyin-pro](https://github.com/zh-lx/pinyin-pro) library; exposes `pinyinPro` on `globalThis` |
| `content.js` | ISOLATED | Renders the subtitle overlay; fetches and parses cues; annotates characters with `<ruby>` tags via `pinyin-pro` |
| `background.js` | Service worker | Cross-origin fetch proxy for subtitle files; passively intercepts subtitle requests via `webRequest` |
| `popup.js` / `popup.html` | Extension popup | Settings UI — track selection, colours, scale, position, toggles (including pinyin on/off) |

Subtitles are fetched in JSON3 format (YouTube's internal timed-text format) and parsed directly in the extension. An XML fallback handles older-format responses. The overlay is synced to the video's `currentTime` at ~12 fps. Chinese characters are annotated at render time: `pinyin-pro` returns one pinyin string per character, and each is wrapped in a `<ruby><rt>` pair.

## Installation

This extension uses Manifest V2 and the `browser.*` WebExtensions API. It runs in **Firefox** without any changes.

**Chrome/Edge** — requires [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) or manual replacement of `browser.*` calls with `chrome.*`.

### Firefox (temporary / development)

1. Clone or download this repo
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**
3. Select `manifest.json`

### Firefox (permanent)

Sign and install via [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/).

## Usage

1. Open a YouTube or Bilibili video that has captions
2. Click the extension icon
3. Select a **Top** track (e.g. Chinese) and optionally a **Bottom** track (e.g. English)
4. Adjust scale, position, and style to taste

The extension hides the site's native subtitles once its own overlay is active. Switching both tracks to **Off** restores the native subtitles.

## Files

```
manifest.json          Extension manifest (MV2)
pinyin-pro.js          Bundled pinyin-pro library (injected before content.js)
content.js             Subtitle overlay (isolated world)
youtube-main.js        YouTube player API access (main world)
background.js          Fetch proxy + webRequest intercept
popup.html / popup.js  Settings popup
subtitles.css          (unused legacy stylesheet)
fonts/
  Hanzi-Pinyin-Font.top.woff2
  Hanzi-Pinyin-Font.top.ttf
```

## Credits

Pinyin computation by [zh-lx/pinyin-pro](https://github.com/zh-lx/pinyin-pro).

Hanzi-Pinyin font by [jtianling/hanzi-pinyin-font](https://github.com/jtianling/hanzi-pinyin-font) (font files retained, not currently used for rendering).
