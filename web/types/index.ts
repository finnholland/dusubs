export interface SavedWord {
  id: string;
  language: 'zh' | 'ja' | 'es' | 'en' | 'fr';
  char?: string;
  py?: string;
  en: string;
  sentNative?: string;  // sentence in the learning language (same language as the saved word)
  sentOther?: string;   // sentence in the other subtitle track
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
