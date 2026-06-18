export interface SavedWord {
  id: string;
  language: 'zh' | 'ja' | 'es' | 'en' | 'fr';
  char?: string;     // word (language-agnostic)
  zh?: string;       // Chinese word (legacy)
  ja?: string;       // Japanese word (legacy)
  py?: string;       // pinyin (zh) or reading (ja)
  en: string;        // definition
  sentZh?: string;   // source sentence in Chinese
  sentJa?: string;   // source sentence in Japanese
  sentEn?: string;   // source sentence in English
  url: string;       // youtube url with timestamp
  ts: number;        // video timestamp seconds
  savedAt: number;   // unix ms
  leitnerBox: 1 | 2 | 3 | 4 | 5;
  lastReviewed: number | null;  // unix ms, null = never reviewed
  nextReview: number | null;    // unix ms, null = not yet scheduled
}

export interface SyncToken {
  token: string;
  createdAt: number;
}
