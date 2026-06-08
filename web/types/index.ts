export interface SavedWord {
  id: string;
  language: 'zh' | 'ja' | 'es' | 'en' | 'fr';
  zh?: string;       // Chinese word
  ja?: string;       // Japanese word
  py?: string;       // pinyin (zh) or reading (ja)
  en: string;        // definition
  sentZh?: string;   // source sentence in Chinese
  sentJa?: string;   // source sentence in Japanese
  sentEn?: string;   // source sentence in English
  url: string;       // youtube url with timestamp
  ts: number;        // video timestamp seconds
  savedAt: number;   // unix ms
  nextReview?: number;
  interval?: number;
  ease?: number;
}

export interface SyncToken {
  token: string;
  createdAt: number;
}
