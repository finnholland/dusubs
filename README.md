# Dusubs

A browser extension that overlays annotated Chinese and Japanese subtitles on YouTube and Bilibili, paired with a companion web app for spaced-repetition flashcard review.

**Extension** → [addons.mozilla.org/firefox/addon/dusubs](https://addons.mozilla.org/firefox/addon/dusubs/)  
**Web app** → [dusubs.com](https://www.dusubs.com)

---

## What it does

While watching a video, the extension replaces the native subtitle display with its own overlay. Chinese subtitles show **pinyin** above each character; Japanese subtitles show **furigana**. Both are rendered with HTML `<ruby>` tags. Hover any word to see its dictionary definition; click to save it. Saved words sync to [dusubs.com](https://www.dusubs.com) where they can be reviewed as flashcards using a Leitner spaced-repetition system.

---

## Tech stack

### Extension

| Concern | Tool | Why |
|---|---|---|
| UI | [Preact](https://preactjs.com/) | ~3 KB vs React's ~40 KB — critical for keeping the extension payload small |
| Bundler | [esbuild](https://esbuild.github.io/) | Compiles `popup.tsx` to a single bundle in milliseconds; no config overhead |
| Language | TypeScript | Popup only; content scripts are plain JS to avoid a build step per file |
| Chinese annotations | [pinyin-pro](https://github.com/zh-lx/pinyin-pro) | Accurate tone-aware pinyin with word-boundary disambiguation |
| Chinese definitions | [CC-CEDICT](https://cc-cedict.org/wiki/) | Open-licensed, regularly maintained Mandarin dictionary (~80k entries) |
| Japanese tokenisation | [kuromoji](https://github.com/takuyaa/kuromoji) | Pure-JS morphological analyser; returns reading (furigana) per token |
| Japanese definitions | [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) | Standard open-licensed Japanese–English dictionary |
| Manifest | V2 (Firefox) / V3 (Chrome) | See decisions below |

### Web app

| Concern | Tool | Why |
|---|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) | Static export support; file-based routing fits the small page count |
| UI | [React 19](https://react.dev/) | Concurrent features; consistent with Next.js 15 expectations |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first; no stylesheet to maintain |
| Auth & database | [Firebase](https://firebase.google.com/) (Auth + Firestore) | Fastest path to user-synced data without managing a server |
| Hosting | AWS S3 + CloudFront | Static export → object storage; CloudFront for CDN and HTTPS |
| DNS | AWS Route 53 | Managed alongside the CloudFront distribution via CDK |
| IaC | [kiki](https://github.com/finnholland/kiki) (AWS CDK wrapper) | Declarative infra for the Route53 → CloudFront → S3 stack |

---

## Architecture decisions

### Manifest V2 over V3

The extension uses MV2 as its primary target (Firefox) with a separate MV3 build for Chrome. The core reason: the extension needs to **intercept subtitle responses**. MV2's `webRequest` API can observe the actual response body of network requests. MV3 replaces this with `declarativeNetRequest`, which can block or redirect requests but cannot read response data. Passively capturing Bilibili's subtitle API responses to extract the subtitle URL — without the user needing to grant extra permissions — requires `webRequest`.

### MAIN world and ISOLATED world content scripts

Browser extensions run content scripts in an `ISOLATED` JavaScript context, meaning they can't access page globals like `window.ytInitialPlayerResponse` or Bilibili's injected objects. To read YouTube's internal player API and discover available caption tracks, a separate script (`youtube-main.js`) runs in the `MAIN` world with full page access. It posts the track list to the isolated `content.js` via `window.postMessage`. This keeps the heavier logic (subtitle fetching, rendering, NLP) sandboxed while still accessing what's only available in the page context.

### kuromoji XHR shim

kuromoji loads its binary dictionary files (12 × `.dat.gz`, ~8 MB total) via `XMLHttpRequest`. In a browser extension, these files live at `moz-extension://` URLs — but kuromoji constructs its own paths and has no way to know that. The solution:

1. All 12 dictionary files are pre-fetched at init time using `browser.runtime.getURL`, then converted to `blob:` URLs.
2. `XMLHttpRequest.prototype.open` is temporarily monkey-patched to redirect any kuromoji dict request to its corresponding blob URL.
3. Once kuromoji finishes building its tokeniser, the original `open` is restored and all blob URLs are revoked.

This keeps kuromoji unmodified and the patch surface minimal.

### Subtitle sync via polling loop

The Web Animations API and `timeupdate` events both fire too coarsely for reliable subtitle sync (`timeupdate` is spec'd at ~4 Hz and varies by browser). The extension runs a `requestAnimationFrame`-driven loop capped at ~12 fps, comparing `video.currentTime` against the parsed cue list on each tick. This gives consistently smooth subtitle transitions without tying the render to the video element's event model.

### Dictionary gzipping at postinstall

CC-CEDICT (`cedict.json`) and JMdict (`ja-dict.json`) are large JSON files — combined ~15 MB uncompressed. They're gzipped at `npm install` time via a `postinstall` script, bringing them to ~5 MB. The browser decompresses them natively when fetched as static assets, so there's no runtime overhead and the extension package stays within AMO's size limits.

### Next.js static export

The web app has no server-side data requirements — all user data is in Firestore and read client-side after Firebase Auth resolves. Next.js is configured with `output: 'export'`, producing a fully static `dist/` folder that's deployed directly to S3 and served through CloudFront. No compute cost, no cold starts, trivial deployment.

### Extension → web app data bridge

The extension saves words to `browser.storage.local`. The web app runs at `dusubs.com`, a different origin with no access to extension storage. A content script (`web-bridge.js`) is injected into every `dusubs.com` page. It listens for `postMessage` events from the page, reads or writes `browser.storage.local` on request, and posts the result back. This keeps the web app a plain web app (no extension API calls) while still letting it access the local word list.

### Leitner over SM-2

The SRS system uses a 5-box Leitner schedule (intervals: 1 → 2 → 4 → 8 → 16 days) rather than the SM-2 algorithm Anki uses. SM-2 tracks per-card ease factors and adjusts intervals based on response quality, which is more optimal for long-term retention but adds meaningful implementation complexity. For vocabulary acquired passively from video context, Leitner's simpler binary (correct/incorrect) model is good enough and far easier to reason about and debug.

---

## Project structure

```
extension/          Firefox/Chrome WebExtension (MV2 primary, MV3 for Chrome)
  src/
    content.js      Subtitle overlay renderer (isolated world)
    youtube-main.js YouTube player API access (main world)
    bilibili-main.js Bilibili subtitle intercept (main world)
    background.js   Cross-origin fetch proxy + webRequest intercept
    popup.tsx       Settings UI (Preact)
    web-bridge.js   Extension ↔ dusubs.com postMessage bridge
  vendor/
    cedict.json.gz  CC-CEDICT (Chinese definitions)
    ja-dict.json.gz JMdict (Japanese definitions)
  dict/             Kuromoji binary dictionary files (*.dat.gz)

web/                Next.js companion site (dusubs.com)
  app/              App Router pages (dashboard, study, settings)
  components/       FlashCard, WordCard, LanguageFilter, Header
  lib/              firebase.ts, auth.ts, words.ts, leitner.ts, extension.ts

scripts/
  make-dict.js      Downloads CC-CEDICT and builds cedict.json
  build-ja-dict.js  Trims JMdict to ja-dict.json
  release.js        Release automation
  amo-sign.js       Signs XPI for Firefox Add-ons Mozilla

infra/              AWS CDK config (Route53, CloudFront, S3)
docs/               Feature specs and architecture notes
```

---

## Credits

- Pinyin by [pinyin-pro](https://github.com/zh-lx/pinyin-pro)
- Japanese tokenisation by [kuromoji](https://github.com/takuyaa/kuromoji)
- Chinese definitions from [CC-CEDICT](https://cc-cedict.org/wiki/)
- Japanese definitions from [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html)
