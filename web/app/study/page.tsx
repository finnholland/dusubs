'use client';

import { useEffect, useState } from 'react';
import { useUser } from '../../lib/auth';
import { getWords } from '../../lib/words';
import FlashCard from '../../components/FlashCard';
import { SavedWord } from '../../types';

export default function StudyPage() {
  const { user, loading } = useUser();

  const [deck, setDeck] = useState<SavedWord[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ known: number; unknown: number }>({ known: 0, unknown: 0 });
  const [done, setDone] = useState(false);

  useEffect(() => {
    getWords(user?.uid ?? null).then(({ words }) => {
      const shuffled = [...words].sort(() => Math.random() - 0.5);
      setDeck(shuffled);
    });
  }, [user]);

  const advance = (known: boolean) => {
    setResults((r) => ({ known: r.known + (known ? 1 : 0), unknown: r.unknown + (known ? 0 : 1) }));
    if (index + 1 >= deck.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
    }
  };

  if (loading) return null;

  if (deck.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-white/40">
        No words to study yet. Save some words from the extension first.
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center gap-6 text-center">
        <h2 className="text-2xl font-semibold">Session complete</h2>
        <div className="flex gap-8 text-lg">
          <div>
            <span className="text-green-400 font-semibold">{results.known}</span>
            <span className="text-white/50 ml-1">known</span>
          </div>
          <div>
            <span className="text-red-400 font-semibold">{results.unknown}</span>
            <span className="text-white/50 ml-1">again</span>
          </div>
        </div>
        <button
          onClick={() => { setIndex(0); setResults({ known: 0, unknown: 0 }); setDone(false); }}
          className="bg-yellow-400 text-[#1a1a2e] font-semibold px-8 py-3 rounded-full hover:bg-yellow-300 transition-colors"
        >
          Study again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col gap-8">
      <div className="flex items-center justify-between text-sm text-white/40">
        <span>Card {index + 1} of {deck.length}</span>
        <span>{results.known} known · {results.unknown} again</span>
      </div>

      <FlashCard
        word={deck[index]}
        onKnown={() => advance(true)}
        onUnknown={() => advance(false)}
      />
    </div>
  );
}
