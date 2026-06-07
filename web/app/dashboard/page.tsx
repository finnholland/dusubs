'use client';

import { useEffect, useState, useCallback } from 'react';
import { DocumentSnapshot } from 'firebase/firestore';
import { useUser } from '../../lib/auth';
import { getWords, deleteWord, exportWords } from '../../lib/words';
import WordCard from '../../components/WordCard';
import LanguageFilter from '../../components/LanguageFilter';
import { SavedWord } from '../../types';


export default function DashboardPage() {
  const { user, loading } = useUser();

  const [words, setWords] = useState<SavedWord[]>([]);
  const [language, setLanguage] = useState<SavedWord['language'] | 'all'>('all');
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [fetching, setFetching] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [source, setSource] = useState<'firebase' | 'extension' | 'none'>('none');

  const load = useCallback(
    async (reset = false) => {
      setFetching(true);
      const lang = language === 'all' ? undefined : language;
      const result = await getWords(user?.uid ?? null, {
        language: lang,
        after: reset ? undefined : lastDoc ?? undefined,
      });
      setWords((prev) => (reset ? result.words : [...prev, ...result.words]));
      setLastDoc(result.lastDoc);
      setHasMore(result.words.length === 50);
      setSource(result.source);
      setFetching(false);
    },
    [user, language, lastDoc]
  );

  useEffect(() => {
    if (loading) return;
    setWords([]);
    setLastDoc(null);
    setHasMore(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, language, loading]);

  const handleDelete = async (id: string, zh?: string) => {
    await deleteWord(user?.uid ?? null, id, zh);
    setWords((prev) => prev.filter((w) => w.id !== id));
  };

  const handleExport = (format: 'anki' | 'quizlet') => {
    const text = exportWords(words, format);
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
            className="border border-white/20 text-white/70 px-4 py-1.5 rounded-full text-sm hover:border-white/40 hover:text-white transition-colors"
          >
            Export Anki
          </button>
          <button
            onClick={() => handleExport('quizlet')}
            className="border border-white/20 text-white/70 px-4 py-1.5 rounded-full text-sm hover:border-white/40 hover:text-white transition-colors"
          >
            Export Quizlet
          </button>
        </div>
      </div>

      <LanguageFilter value={language} onChange={setLanguage} />

      {source === 'extension' && (
        <p className="text-white/50 text-sm text-center border border-white/10 rounded-xl py-3 px-4">
          Showing local words from the extension.{' '}
          <a href="/login" className="text-yellow-400 hover:underline">Sign in</a>
          {' '}to sync across devices.
        </p>
      )}

      {words.length === 0 && !fetching && (
        <p className="text-white/40 text-sm py-12 text-center">
          {source === 'none'
            ? 'Install the extension and start watching to save words.'
            : 'No words saved yet. Start watching to save words!'}
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {words.map((w) => (
          <WordCard key={w.id} word={w} onDelete={handleDelete} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => load()}
          disabled={fetching}
          className="mx-auto border border-white/20 text-white/60 px-8 py-2 rounded-full text-sm hover:border-white/40 hover:text-white transition-colors disabled:opacity-40"
        >
          {fetching ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
