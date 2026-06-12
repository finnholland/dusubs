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
  uid: string | null,
  { language, after }: GetWordsOptions = {}
): Promise<{ words: SavedWord[]; lastDoc: DocumentSnapshot | null; source: 'firebase' | 'extension' | 'none' }> {
  if (!uid) {
    const words = await getWordsFromExtension();
    if (words) {
      const filtered = language ? words.filter((w) => w.language === language) : words;
      return { words: filtered, lastDoc: null, source: 'extension' };
    }
    return { words: [], lastDoc: null, source: 'none' };
  }

  const ref = collection(getDb(), 'users', uid, 'words');
  const constraints = [
    ...(language ? [where('language', '==', language)] : []),
    orderBy('savedAt', 'desc'),
    limit(PAGE_SIZE),
    ...(after ? [startAfter(after)] : []),
  ];
  const q = query(ref, ...constraints);
  const snap = await getDocs(q);
  const words = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SavedWord));
  const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
  return { words, lastDoc, source: 'firebase' };
}

export async function saveWord(
  uid: string | null,
  word: Omit<SavedWord, 'id'>
): Promise<string> {
  if (!uid) {
    saveWordToExtension(word);
    return word.zh ?? word.ja ?? word.en;
  }
  const ref = collection(getDb(), 'users', uid, 'words');
  const docRef = await addDoc(ref, word);
  return docRef.id;
}

export async function deleteWord(uid: string | null, wordId: string, key?: string): Promise<void> {
  if (!uid) {
    if (key) deleteWordFromExtension(key);
    return;
  }
  await deleteDoc(doc(getDb(), 'users', uid, 'words', wordId));
}

export async function deleteAllWords(uid: string | null): Promise<void> {
  if (!uid) {
    deleteAllWordsFromExtension();
    return;
  }
  const ref = collection(getDb(), 'users', uid, 'words');
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
        const front = w.zh ?? w.ja ?? w.en ?? '';
        let back = `${escHtml(w.py ?? '')}${w.py ? '<br>' : ''}${escHtml(w.en ?? '')}`;
        const sentZh = w.sentZh ?? w.sentJa ?? '';
        const sentEn = w.sentEn ?? '';
        if (sentZh || sentEn) {
          back += `<br><i>${escHtml([sentZh, sentEn].filter(Boolean).join(' · '))}</i>`;
        }
        return `${front}\t${back}`;
      })
      .join('\n');
  }
  return words
    .map((w) => `${w.zh ?? w.ja ?? w.en ?? ''}\t${w.py ? `${w.py} · ` : ''}${w.en ?? ''}`)
    .join('\n');
}
