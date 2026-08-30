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
}

export async function getWords(
  token: string | null,
  { language, after }: GetWordsOptions = {}
): Promise<{ words: SavedWord[]; lastDoc: DocumentSnapshot | null; source: 'firebase' | 'extension' | 'both' | 'none' }> {
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
    orderBy('savedAt', 'desc'),
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
  const docRef = await addDoc(ref, word);
  return docRef.id;
}

export async function deleteWord(token: string | null, wordId: string, key?: string): Promise<void> {
  if (!token) {
    if (key) deleteWordFromExtension(key);
    return;
  }
  await deleteDoc(doc(getDb(), 'users', token, 'words', wordId));
}

export async function deleteAllWords(token: string | null): Promise<void> {
  if (!token) {
    deleteAllWordsFromExtension();
    return;
  }
  const ref = collection(getDb(), 'users', token, 'words');
  const snap = await getDocs(query(ref));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
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
