'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '../../lib/auth';
import { getWords } from '../../lib/words';
import FlashCard from '../../components/FlashCard';
import { SavedWord } from '../../types';
import {
  demote, filterDue, LeitnerProgress, loadProgress, nextDueDate, promote, saveProgress,
} from '../../lib/leitner';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

type Status = 'loading' | 'empty' | 'caught-up' | 'studying' | 'done';

export default function StudyPage() {
  const { user, loading } = useUser();
  const allWordsRef = useRef<SavedWord[]>([]);
  const progressRef = useRef<LeitnerProgress>({});

  const [status, setStatus] = useState<Status>('loading');
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [queue, setQueue] = useState<SavedWord[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState({ known: 0, unknown: 0 });

  const startSession = () => {
    const today = todayStr();
    const progress = loadProgress();
    progressRef.current = progress;
    const due = [...filterDue(allWordsRef.current, progress, today)].sort(() => Math.random() - 0.5);
    if (due.length === 0) {
      setNextDue(nextDueDate(progress));
      setStatus('caught-up');
    } else {
      setQueue(due);
      setIndex(0);
      setResults({ known: 0, unknown: 0 });
      setNextDue(null);
      setStatus('studying');
    }
  };

  useEffect(() => {
    getWords(user?.uid ?? null).then(({ words }) => {
      allWordsRef.current = words;
      if (words.length === 0) {
        setStatus('empty');
      } else {
        startSession();
      }
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = (known: boolean) => {
    const today = todayStr();
    const word = queue[index];
    const progress = progressRef.current;

    if (known) {
      progress[word.id] = promote(progress[word.id], today);
      saveProgress(progress);
      setResults((r) => ({ ...r, known: r.known + 1 }));
      if (index + 1 >= queue.length) {
        setStatus('done');
      } else {
        setIndex((i) => i + 1);
      }
    } else {
      progress[word.id] = demote(today);
      saveProgress(progress);
      setResults((r) => ({ ...r, unknown: r.unknown + 1 }));
      setQueue((q) => [...q, word]);
      setIndex((i) => i + 1);
    }
  };

  if (loading || status === 'loading') return null;

  if (status === 'empty') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-white/40">
        No words to study yet. Save some words from the extension first.
      </div>
    );
  }

  if (status === 'caught-up') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-semibold">All caught up</h2>
        {nextDue && <p className="text-white/50">Next review {formatDate(nextDue)}</p>}
      </div>
    );
  }

  if (status === 'done') {
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
          onClick={startSession}
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
        <span>Card {index + 1} of {queue.length}</span>
        <span>{results.known} known · {results.unknown} again</span>
      </div>

      <FlashCard
        key={queue[index]?.id}
        word={queue[index]}
        onKnown={() => advance(true)}
        onUnknown={() => advance(false)}
      />
    </div>
  );
}
