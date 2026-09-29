import { SavedWord } from '../types';

type ExtWord = {
  char?: string;
  zh?: string;       // legacy
  ja?: string;       // legacy
  key?: string;      // legacy
  language?: SavedWord['language'];
  reading?: string;
  en: string;
  sentNative?: string;
  sentZh?: string;
  sentJa?: string;
  sentKey?: string;  // legacy
  sentOther?: string;
  url: string;
  leitnerBox?: number;
  lastReviewed?: number | null;
  nextReview?: number | null;
};

function toSavedWord(w: ExtWord): SavedWord {
  const lang = w.language ?? 'zh';
  const word = w.char ?? w.zh ?? w.ja ?? w.key;
  return {
    id: word ?? w.en,
    language: lang,
    char: word,
    reading: w.reading,
    en: w.en,
    sentNative: w.sentNative ?? w.sentZh ?? (lang === 'zh' ? w.sentKey : undefined) ?? w.sentJa ?? (lang === 'ja' ? w.sentKey : undefined),
    sentOther: w.sentOther,
    url: w.url,
    ts: 0,
    savedAt: 0,
    leitnerBox: (w.leitnerBox as SavedWord['leitnerBox']) ?? 1,
    lastReviewed: w.lastReviewed ?? null,
    nextReview: w.nextReview ?? null,
  };
}

/**
 * Returns words from the browser extension, or null if not installed.
 *
 * On a fresh navigation (e.g. opening dusubs.com/study straight from the
 * extension popup) the content script that bridges postMessage to
 * browser.storage.local can still be injecting when this fires, so a single
 * request can race it and time out even though the extension is installed.
 * Retry the request a few times with a growing delay before giving up.
 */
export function getWordsFromExtension(): Promise<SavedWord[] | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const retryDelaysMs = [300, 600, 1200];

  return new Promise((resolve) => {
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;

    function handler(e: MessageEvent) {
      if (e.data?.type !== 'DUSUBS_WORDS') return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      resolve((e.data.words as ExtWord[]).map(toSavedWord));
    }

    function attemptRequest() {
      window.postMessage({ type: 'DUSUBS_GET_WORDS' }, '*');
      timer = setTimeout(() => {
        if (attempt < retryDelaysMs.length) {
          attempt++;
          attemptRequest();
        } else {
          window.removeEventListener('message', handler);
          resolve(null);
        }
      }, retryDelaysMs[attempt]);
    }

    window.addEventListener('message', handler);
    attemptRequest();
  });
}

export function saveWordToExtension(word: Omit<SavedWord, 'id'>): void {
  window.postMessage({ type: 'DUSUBS_SAVE_WORD', word }, '*');
}

export function deleteWordFromExtension(key: string): void {
  window.postMessage({ type: 'DUSUBS_DELETE_WORD', key }, '*');
}

export function deleteAllWordsFromExtension(): void {
  window.postMessage({ type: 'DUSUBS_DELETE_ALL_WORDS' }, '*');
}

export function updateWordInExtension(key: string, patch: Partial<Pick<SavedWord, 'leitnerBox' | 'lastReviewed' | 'nextReview'>>): void {
  window.postMessage({ type: 'DUSUBS_UPDATE_WORD', key, patch }, '*');
}

/**
 * Returns the sync token currently linked in the extension installed in
 * *this* browser, or null if there's no extension (or it has none linked).
 * Same retry pattern as getWordsFromExtension, to survive the content
 * script still injecting on a fresh navigation.
 */
export function getExtensionSyncToken(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const retryDelaysMs = [300, 600, 1200];

  return new Promise((resolve) => {
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;

    function handler(e: MessageEvent) {
      if (e.data?.type !== 'DUSUBS_SYNC_TOKEN') return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      resolve(e.data.token ?? null);
    }

    function attemptRequest() {
      window.postMessage({ type: 'DUSUBS_GET_SYNC_TOKEN' }, '*');
      timer = setTimeout(() => {
        if (attempt < retryDelaysMs.length) {
          attempt++;
          attemptRequest();
        } else {
          window.removeEventListener('message', handler);
          resolve(null);
        }
      }, retryDelaysMs[attempt]);
    }

    window.addEventListener('message', handler);
    attemptRequest();
  });
}

/**
 * Fire-and-forget: asks the extension to run its sync cycle immediately for
 * the account `uuid` (the bare capability, not the full displayed token).
 * Only call this once the caller has already confirmed the extension's own
 * full linked token (from getExtensionSyncToken) matches this browser's
 * linked token — the extension re-checks this itself too (defense in
 * depth), but the page shouldn't offer the button otherwise.
 */
export function requestSyncNow(uuid: string): void {
  window.postMessage({ type: 'DUSUBS_SYNC_NOW', uuid }, '*');
}
