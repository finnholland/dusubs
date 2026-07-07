# Wire up Spanish (es) in the /web app

## Context

The extension's Spanish learn mode is fully working — words saved via the tooltip have
`language: 'es'`, `char` (the word), `en` (English defs), `sentNative`, `sentOther`, `url`,
`ts`. The web app already stores and displays these words generically (WordCard has the 🇪🇸
flag, `word.char` and `word.en` both render fine), but Spanish is gated behind "coming soon"
in two places, and the study/flashcard flow only covers zh/ja.

## What needs to be done

### 1. `web/components/LanguageFilter.tsx`
- Move `{ value: 'es', label: 'Español' }` from `COMING_SOON_LANGUAGES` into `ACTIVE_LANGUAGES`
- That's it — the dashboard word list and filtering already work once it's active

### 2. `web/app/study/page.tsx`
- Add `{ value: 'es', label: '🇪🇸 Español' }` to the `STUDY_LANGS` array (lines 11-15)
- That's it — `wordsForLang()` already filters by language, FlashCard renders generically

### 3. `web/components/FlashCard.tsx`
- Spanish words have no `py` field (no pinyin/romaji) — confirm the card doesn't show an
  empty/broken pinyin hint line for es words. If it does, guard: `{word.py && ...}`.
- The front-of-card shows `word.char` (the Spanish word) in yellow — fine as-is.
- The back shows `word.en` (English definition) — fine as-is.

## What is already correct (no changes needed)

- `web/types/index.ts` — `SavedWord.language` already includes `'es'`
- `web/components/WordCard.tsx` — already renders es words correctly with 🇪🇸 flag
- `web/lib/words.ts` — `getWords(language)` filter already works for `'es'`
- `web/app/dashboard/page.tsx` — already passes language filter through to WordCard

## Verification
1. Save a Spanish word from the extension
2. Open `/web` dashboard → filter by Español → word appears with 🇪🇸 and English def
3. Open `/study` → select Español → flashcard shows Spanish word front, English back
4. Confirm no empty pinyin line appears on flashcard for es words
