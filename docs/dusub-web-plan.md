# DuSub Website Scaffold Plan
> Hand this to Claude Code to build `/web` inside the existing extension repo.

---

## Context

This is the companion website for the DuSub Firefox extension — a dual-subtitle Chinese/language learning tool. Users save words while watching video and review them here. The extension lives at the repo root; the website goes in `/web` with its own `package.json` and `node_modules` — completely isolated from the extension.

---

## 1. Folder Structure

Create `/web` as a standalone Next.js app. Do not touch anything outside `/web`.

```
/web
  /app
    /layout.tsx
    /page.tsx              ← landing / marketing page
    /dashboard
      /page.tsx            ← saved words list
    /study
      /page.tsx            ← flashcard study mode
    /settings
      /page.tsx            ← language prefs, account
  /components
    /WordCard.tsx
    /FlashCard.tsx
    /LanguageFilter.tsx
    /Header.tsx
  /lib
    /firebase.ts           ← firebase init
    /auth.ts               ← auth helpers
    /words.ts              ← firestore queries
  /types
    /index.ts              ← shared types
  package.json             ← independent, no shared deps with extension
  .env.local               ← firebase config (gitignored)
  next.config.js
  tsconfig.json
  tailwind.config.js
```

---

## 2. Stack

- **Framework**: Next.js 14 (app router)
- **Auth + DB**: Firebase (Firestore + Firebase Auth)
- **Styling**: Tailwind CSS
- **Language**: TypeScript

```bash
cd web
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
npm install firebase
```

---

## 3. Types

Define in `/web/types/index.ts`:

```ts
export interface SavedWord {
  id: string;
  language: 'zh' | 'ja' | 'es' | 'en' | 'fr';
  zh?: string;
  py?: string;         // pinyin (zh) or furigana (ja)
  en: string;          // definition
  sentZh?: string;     // source sentence (target language)
  sentEn?: string;     // source sentence (English)
  url: string;         // youtube url with timestamp
  ts: number;          // video timestamp seconds
  savedAt: number;     // unix ms
  // SRS fields (leave null for now, add later)
  nextReview?: number;
  interval?: number;
  ease?: number;
}
```

---

## 4. Firebase Setup

`/web/lib/firebase.ts` — initialise from env vars:

```ts
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // etc
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
```

Enable Firestore offline persistence in the root layout.

---

## 5. Firestore Data Model

```
users/{uid}/words/{wordId}   ← SavedWord document
```

Indexes needed:
- `savedAt DESC` — default list view
- `language, savedAt DESC` — filtered by language
- `nextReview ASC` — for SRS later

`/web/lib/words.ts` should expose:

```ts
getWords(uid, { language?, limit?, after? })   // paginated, 50 at a time
saveWord(uid, word)
deleteWord(uid, wordId)
exportWords(uid, format: 'anki' | 'quizlet')
```

---

## 6. Auth

**SUGGEST SOMETHING LIGHTWEIGHT**
- Ideally use mozilla a token tied to mozilla account (google if on chrome but not there yet)
OR
- Use **Google Sign-In** via Firebase Auth for simplicity
- On first sign-in, generate a short **sync token** (stored in Firestore under `users/{uid}/syncToken`) — this is what the extension uses to link to the account without storing full credentials
- `/web/lib/auth.ts` exposes `signIn()`, `signOut()`, `useUser()` hook

---

## 7. Pages to Scaffold

### Landing `/app/page.tsx`
- Hero with extension description + install button (links to AMO)
- Screenshot/preview of the extension
- "Sign in to sync your words" CTA
- Keep it simple — not a full marketing site yet

### Dashboard `/app/dashboard/page.tsx`
- Requires auth (redirect to landing if not signed in)
- List of saved words as cards
- Filter by language
- Pagination (load 50 at a time, "load more" button)
- Each card shows: zh/word, pinyin, definition, sentence, link back to video timestamp
- Delete button per card
- Export button (Anki / Quizlet) — top of list

### Study `/app/study/page.tsx`
- Simple flashcard mode
- Show word, user flips to see definition + sentence
- Mark as known/unknown (just UI for now, SRS logic later)
- Pull from same word list

### Settings `/app/settings/page.tsx`
- Show sync token (for linking extension)
- Language preferences
- Delete account / clear all words

---

## 8. Extension → Website Sync Bridge

The extension needs to know the user's Firebase UID to write words directly to Firestore. Flow:

1. User visits `/settings` on the website, sees their sync token
2. User pastes token into extension popup
3. Extension stores token in `browser.storage.local`
4. On save, extension writes directly to `users/{uid}/words` using the token to auth

For now scaffold the UI for this flow (token display in settings, input field in extension popup). The actual Firestore write from the extension can be wired up after the website is live.

---

## 9. Styling Notes

Match the extension's aesthetic:
- Dark navy background (`#1a1a2e` or similar)
- Warm yellow accent for Chinese text (matching the icon)
- Clean sans-serif, generous spacing
- Cards with subtle borders, no heavy shadows

---

## 10. What NOT to build yet

- SRS scheduling algorithm
- Mobile app
- Social/sharing features
- Any payment/subscription UI

Keep 1.1 scope tight: auth, word list, study mode, export, sync token.

---

## Commands to Run

```bash
# from repo root
mkdir web && cd web
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
npm install firebase
# then create .env.local with firebase config
```

Start dev server on a different port to avoid clash with any extension tooling:
```bash
next dev -p 3001
```
