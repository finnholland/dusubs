'use client';

import { useEffect, useState, useCallback, useReducer } from 'react';
import { DocumentSnapshot } from 'firebase/firestore';
import Link from 'next/link';
import { useSyncToken } from '../../lib/auth';
import { getWords, deleteWord, exportWords } from '../../lib/words';
import WordCard from '../../components/WordCard';
import LanguageFilter from '../../components/LanguageFilter';
import { SavedWord } from '../../types';

type ListState = {
  words: SavedWord[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
  fetching: boolean;
  source: 'firebase' | 'extension' | 'none';
};

type ListAction =
  | { type: 'fetch_start' }
  | { type: 'fetch_done'; words: SavedWord[]; lastDoc: DocumentSnapshot | null; source: 'firebase' | 'extension' | 'none'; append: boolean }
  | { type: 'delete'; id: string };

const initialList: ListState = { words: [], lastDoc: null, hasMore: true, fetching: false, source: 'none' };

function listReducer(state: ListState, action: ListAction): ListState {
  switch (action.type) {
    case 'fetch_start':
      return { ...state, fetching: true };
    case 'fetch_done':
      return {
        words: action.append ? [...state.words, ...action.words] : action.words,
        lastDoc: action.lastDoc,
        hasMore: action.words.length === 50,
        fetching: false,
        source: action.source,
      };
    case 'delete':
      return { ...state, words: state.words.filter((w) => w.id !== action.id) };
  }
}

export default function DashboardPage() {
  const { token, loading } = useSyncToken();
  const [language, setLanguage] = useState<SavedWord['language'] | 'all'>('all');
  const [list, dispatch] = useReducer(listReducer, initialList);

  const load = useCallback(
    async (after: DocumentSnapshot | null) => {
      dispatch({ type: 'fetch_start' });
      const lang = language === 'all' ? undefined : language;
      const result = await getWords(token, { language: lang, after: after ?? undefined });
      dispatch({ type: 'fetch_done', words: result.words, lastDoc: result.lastDoc, source: result.source, append: after !== null });
    },
    [token, language]
  );

  useEffect(() => {
    if (loading) return;
    load(null);
  }, [token, language, loading, load]);

  const handleDelete = async (id: string, key?: string) => {
    await deleteWord(token, id, key);
    dispatch({ type: 'delete', id });
  };

  const handleExport = (format: 'anki' | 'quizlet') => {
    const text = exportWords(list.words, format);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dusubs-words.${format === 'anki' ? 'txt' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Saved Words</h1>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('anki')}
            className="border border-white/20 text-white/70 px-4 py-1.5 rounded-full text-sm hover:border-yellow-400 hover:text-yellow-400 transition-colors cursor-pointer"
          >
            Export Anki
          </button>
          <button
            onClick={() => handleExport('quizlet')}
            className="border border-white/20 text-white/70 px-4 py-1.5 rounded-full text-sm hover:border-yellow-400 hover:text-yellow-400 transition-colors cursor-pointer"
          >
            Export Quizlet
          </button>
        </div>
      </div>

      <LanguageFilter value={language} onChange={setLanguage} />

      {list.source === 'extension' && (
        <p className="text-white/50 text-sm text-center border border-white/10 rounded-xl py-3 px-4">
          Showing words from the extension.{' '}
          <Link href="/settings" className="text-yellow-400 hover:underline">
            Get a sync token in Settings
          </Link>
          {' '}to sync across devices.
        </p>
      )}

      {list.words.length === 0 && !list.fetching && (
        <p className="text-white/40 text-sm py-12 text-center">
          {list.source === 'none'
            ? 'Install the extension and start watching to save words.'
            : 'No words saved yet. Start watching to save words!'}
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.words.map((w) => (
          <WordCard key={w.id} word={w} onDelete={handleDelete} showLanguage={language === 'all'} />
        ))}
      </div>

      {list.hasMore && (
        <button
          onClick={() => load(list.lastDoc)}
          disabled={list.fetching}
          className="mx-auto border border-white/20 text-white/60 px-8 py-2 rounded-full text-sm hover:border-white/40 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
        >
          {list.fetching ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
