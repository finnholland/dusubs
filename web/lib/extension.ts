import { SavedWord } from '../types';

type ExtWord = {
  zh?: string;
  py?: string;
  en: string;
  sentZh?: string;
  sentEn?: string;
  url: string;
};

function toSavedWord(w: ExtWord): SavedWord {
  return {
    id: w.zh ?? w.en,
    language: 'zh',
    zh: w.zh,
    py: w.py,
    en: w.en,
    sentZh: w.sentZh,
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
      console.log(e.data)
      resolve((e.data.words as ExtWord[]).map(toSavedWord));
    }

    window.addEventListener('message', handler);
    window.postMessage({ type: 'DUSUBS_GET_WORDS' }, '*');
  });
}

export function saveWordToExtension(word: Omit<SavedWord, 'id'>): void {
  window.postMessage({ type: 'DUSUBS_SAVE_WORD', word }, '*');
}

export function deleteWordFromExtension(zh: string): void {
  window.postMessage({ type: 'DUSUBS_DELETE_WORD', zh }, '*');
}

export function deleteAllWordsFromExtension(): void {
  window.postMessage({ type: 'DUSUBS_DELETE_ALL_WORDS' }, '*');
}
