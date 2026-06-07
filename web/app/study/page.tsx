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
  const freestyleRef = useRef(false);
  const requeuedRef = useRef<Set<string>>(new Set());

  const [status, setStatus] = useState<Status>('loading');
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [queue, setQueue] = useState<SavedWord[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState({ known: 0, unknown: 0 });

  const startSession = () => {
    freestyleRef.current = false;
    requeuedRef.current = new Set();
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

  const startFreestyle = () => {
    freestyleRef.current = true;
    requeuedRef.current = new Set();
    const shuffled = [...allWordsRef.current].sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setIndex(0);
    setResults({ known: 0, unknown: 0 });
    setStatus('studying');
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
      if (!freestyleRef.current && !requeuedRef.current.has(word.id)) {
        progress[word.id] = promote(progress[word.id], today);
        saveProgress(progress);
      }
      if (!requeuedRef.current.has(word.id)) {
        setResults((r) => ({ ...r, known: r.known + 1 }));
      }
      if (index + 1 >= queue.length) {
        setStatus('done');
      } else {
        setIndex((i) => i + 1);
      }
    } else {
      if (!freestyleRef.current) {
        progress[word.id] = demote(today);
        saveProgress(progress);
      }
      if (!requeuedRef.current.has(word.id)) {
        requeuedRef.current.add(word.id);
        setResults((r) => ({ ...r, unknown: r.unknown + 1 }));
      }
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
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center gap-6 text-center">
        <h2 className="text-2xl font-semibold">All caught up</h2>
        {nextDue && <p className="text-white/50">Next review {formatDate(nextDue)}</p>}
        <button
          onClick={startFreestyle}
          className="mt-2 px-8 py-3 rounded-full border border-white/20 text-white/60 hover:border-white/40 hover:text-white/80 transition-colors text-sm font-medium"
        >
          Freestyle — practice all words
        </button>
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
        <span>Card {index + 1} of {queue.length}{freestyleRef.current ? ' · freestyle' : ''}</span>
        <span>{results.known} known · {results.unknown} again</span>
      </div>

      <FlashCard
        key={index}
        word={queue[index]}
        freestyle={freestyleRef.current}
        onKnown={() => advance(true)}
        onUnknown={() => advance(false)}
      />
    </div>
  );
}
