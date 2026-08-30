import {
  collection,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  DocumentSnapshot,
} from 'firebase/firestore';
import { getDb } from './firebase';
import { SavedWord } from '../types';
import { getWordsFromExtension, saveWordToExtension, deleteWordFromExtension, deleteAllWordsFromExtension } from './extension';

const PAGE_SIZE = 50;

interface GetWordsOptions {
  language?: SavedWord['language'];
  after?: DocumentSnapshot;
  /** Skip the cache and hit Firestore/the extension directly. */
  force?: boolean;
}

type WordsResult = { words: SavedWord[]; lastDoc: DocumentSnapshot | null; source: 'firebase' | 'extension' | 'both' | 'none' };

// In-memory, first-page-only cache so switching tabs (Dashboard <-> Study)
// or revisiting a page doesn't re-hit Firestore + round-trip the extension
// every time — both pages load the same "all words" first page on mount.
// Keyed by token + language since each combination is a distinct query.
// Cleared on any write (save/delete) so edits are never stale, and lives
// only for the tab's lifetime (module-level, not persisted).
const firstPageCache = new Map<string, WordsResult>();

function cacheKey(token: string | null, language: SavedWord['language'] | undefined): string {
  return `${token ?? '(none)'}::${language ?? '(all)'}`;
}

export function invalidateWordsCache(): void {
  firstPageCache.clear();
}

export async function getWords(
  token: string | null,
  { language, after, force }: GetWordsOptions = {}
): Promise<WordsResult> {
  // Only the first page (no cursor) is cacheable — pagination pages are
  // fetched on demand and never revisited via tab-switching.
  if (!after) {
    const key = cacheKey(token, language);
    if (!force) {
      const cached = firstPageCache.get(key);
      if (cached) return cached;
    }
    const result = await fetchWords(token, { language, after });
    firstPageCache.set(key, result);
    return result;
  }
  return fetchWords(token, { language, after });
}

async function fetchWords(
  token: string | null,
  { language, after }: GetWordsOptions
): Promise<WordsResult> {
  if (!token) {
    const words = await getWordsFromExtension();
    if (words) {
      const filtered = language ? words.filter((w) => w.language === language) : words;
      return { words: filtered, lastDoc: null, source: 'extension' };
    }
    return { words: [], lastDoc: null, source: 'none' };
  }

  const ref = collection(getDb(), 'users', token, 'words');
  const constraints = [
    ...(language ? [where('language', '==', language)] : []),
    // Order by updatedAt, not savedAt: every doc gets updatedAt stamped
    // unconditionally on every push (see sync.js pushWord), so it's
    // guaranteed present. savedAt wasn't stamped by older extension builds
    // (fixed going forward, see tooltip.js/web-bridge.js), and Firestore
    // excludes any doc missing the field being ordered on — querying by it
    // would silently return zero results for words synced before that fix.
    orderBy('updatedAt', 'desc'),
    limit(PAGE_SIZE),
    ...(after ? [startAfter(after)] : []),
  ];
  const q = query(ref, ...constraints);
  const snap = await getDocs(q);
  const cloudWords = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SavedWord));
  const lastDoc = snap.docs[snap.docs.length - 1] ?? null;

  // Merge in the extension's local words too, in case the browser has words
  // that haven't synced to Firestore yet (or never will, e.g. after the
  // extension's storage was cleared but before the deletion synced up).
  // Only do this on the first page — paginated Firestore reads shouldn't
  // keep re-merging the same local words onto every page.
  if (!after) {
    const extWords = await getWordsFromExtension();
    if (extWords && extWords.length > 0) {
      const filtered = language ? extWords.filter((w) => w.language === language) : extWords;
      const byId = new Map(cloudWords.map((w) => [w.id, w]));
      for (const w of filtered) {
        // Firestore wins on conflict — it's the last-write-wins merge target
        // that both the extension's background sync and other devices push
        // to, so it's the more authoritative copy when both sides have it.
        if (!byId.has(w.id)) byId.set(w.id, w);
      }
      return { words: Array.from(byId.values()), lastDoc, source: 'both' };
    }
  }

  return { words: cloudWords, lastDoc, source: 'firebase' };
}

export async function saveWord(
  token: string | null,
  word: Omit<SavedWord, 'id'>
): Promise<string> {
  if (!token) {
    saveWordToExtension(word);
    return word.char ?? word.en;
  }
  const ref = collection(getDb(), 'users', token, 'words');
  // Stamp updatedAt directly (rather than relying on the extension's sync
  // cycle to add it later) — this doc is written straight to Firestore, so
  // nothing else will set the field the dashboard query orders by.
  const docRef = await addDoc(ref, { ...word, updatedAt: Date.now() });
  invalidateWordsCache();
  return docRef.id;
}

export async function deleteWord(token: string | null, wordId: string, key?: string): Promise<void> {
  if (!token) {
    if (key) deleteWordFromExtension(key);
    invalidateWordsCache();
    return;
  }
  await deleteDoc(doc(getDb(), 'users', token, 'words', wordId));
  invalidateWordsCache();
}

export async function deleteAllWords(token: string | null): Promise<void> {
  if (!token) {
    deleteAllWordsFromExtension();
    invalidateWordsCache();
    return;
  }
  const ref = collection(getDb(), 'users', token, 'words');
  const snap = await getDocs(query(ref));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  invalidateWordsCache();
}

function escHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function exportWords(
  words: SavedWord[],
  format: 'anki' | 'quizlet'
): string {
  if (format === 'anki') {
    return words
      .map((w) => {
        const front = w.char ?? w.en ?? '';
        let back = `${escHtml(w.reading ?? '')}${w.reading ? '<br>' : ''}${escHtml(w.en ?? '')}`;
        const sentNative = w.sentNative ?? '';
        const sentOther = w.sentOther ?? '';
        if (sentNative || sentOther) {
          back += `<br><i>${escHtml([sentNative, sentOther].filter(Boolean).join(' · '))}</i>`;
        }
        return `${front}\t${back}`;
      })
      .join('\n');
  }
  return words
    .map((w) => `${w.char ?? w.en ?? ''}\t${w.reading ? `${w.reading} · ` : ''}${w.en ?? ''}`)
    .join('\n');
}
