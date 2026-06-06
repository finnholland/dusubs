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

const PAGE_SIZE = 50;

interface GetWordsOptions {
  language?: SavedWord['language'];
  after?: DocumentSnapshot;
}

export async function getWords(
  uid: string,
  { language, after }: GetWordsOptions = {}
): Promise<{ words: SavedWord[]; lastDoc: DocumentSnapshot | null }> {
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
  return { words, lastDoc };
}

export async function saveWord(
  uid: string,
  word: Omit<SavedWord, 'id'>
): Promise<string> {
  const ref = collection(getDb(), 'users', uid, 'words');
  const docRef = await addDoc(ref, word);
  return docRef.id;
}

export async function deleteWord(uid: string, wordId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'users', uid, 'words', wordId));
}

export function exportWords(
  words: SavedWord[],
  format: 'anki' | 'quizlet'
): string {
  if (format === 'anki') {
    return words
      .map((w) => `${w.zh ?? w.en}\t${w.en}${w.py ? ` [${w.py}]` : ''}${w.sentEn ? `\n${w.sentEn}` : ''}`)
      .join('\n');
  }
  return words
    .map((w) => `${w.zh ?? w.en}, ${w.en}${w.py ? ` [${w.py}]` : ''}`)
    .join('\n');
}
