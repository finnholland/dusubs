import { SavedWord } from '../types';

type ExtWord = {
  zh?: string;
  ja?: string;
  key?: string;      // legacy
  language?: SavedWord['language'];
  py?: string;
  en: string;
  sentZh?: string;
  sentJa?: string;
  sentKey?: string;  // legacy
  sentEn?: string;
  url: string;
};

function toSavedWord(w: ExtWord): SavedWord {
  const lang = w.language ?? 'zh';
  const word = w.zh ?? w.ja ?? w.key;
  return {
    id: word ?? w.en,
    language: lang,
    zh: w.zh ?? (lang === 'zh' ? w.key : undefined),
    ja: w.ja ?? (lang === 'ja' ? w.key : undefined),
    py: w.py,
    en: w.en,
    sentZh: w.sentZh ?? (lang === 'zh' ? w.sentKey : undefined),
    sentJa: w.sentJa ?? (lang === 'ja' ? w.sentKey : undefined),
    sentEn: w.sentEn,
    url: w.url,
    ts: 0,
    savedAt: 0,
  };
}

/** Returns words from the browser extension, or null if not installed. */
export function getWordsFromExtension(): Promise<SavedWord[] | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 300);

    function handler(e: MessageEvent) {
      if (e.data?.type !== 'DUSUBS_WORDS') return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      resolve((e.data.words as ExtWord[]).map(toSavedWord));
    }

    window.addEventListener('message', handler);
    window.postMessage({ type: 'DUSUBS_GET_WORDS' }, '*');
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
