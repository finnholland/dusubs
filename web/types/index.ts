export interface SavedWord {
  id: string;
  language: 'zh' | 'ja' | 'es' | 'en' | 'fr';
  zh?: string;
  py?: string;      // pinyin (zh) or furigana (ja)
  en: string;       // definition
  sentZh?: string;  // source sentence (target language)
  sentEn?: string;  // source sentence (English)
  url: string;      // youtube url with timestamp
  ts: number;       // video timestamp seconds
  savedAt: number;  // unix ms
  nextReview?: number;
  interval?: number;
  ease?: number;
}

export interface SyncToken {
  token: string;
  createdAt: number;
}
