'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '../../lib/auth';
import { getWords } from '../../lib/words';
import FlashCard from '../../components/FlashCard';
import { SavedWord } from '../../types';
import { demoteWord, filterDue, formatDueDate, nextDueDate, promoteWord } from '../../lib/leitner';
import { updateWordInExtension } from '../../lib/extension';

const STUDY_LANGS: { value: SavedWord['language'] | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'zh', label: '🇨🇳 中文' },
  { value: 'ja', label: '🇯🇵 日本語' },
];

function LangSwitcher({ value, onChange }: { value: SavedWord['language'] | 'all'; onChange: (l: SavedWord['language'] | 'all') => void }) {
  return (
    <div className="flex gap-2 justify-center">
      {STUDY_LANGS.map((l) => (
        <button
          key={l.value}
          onClick={() => onChange(l.value)}
          className={`px-3 py-1 rounded-full text-sm border transition-colors cursor-pointer ${value === l.value
            ? 'bg-yellow-400 text-black border-yellow-400 font-medium'
            : 'border-white/20 text-white/60 hover:border-white/40 hover:text-white'
            }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

type Status = 'loading' | 'selecting' | 'empty' | 'empty-lang' | 'caught-up' | 'studying' | 'done';
type SelectionMode = 'review' | 'freestyle';

export default function StudyPage() {
  const { user, loading } = useUser();
  const requeuedRef = useRef<Set<string>>(new Set());
  const studyLangRef = useRef<SavedWord['language'] | 'all'>('all');

  const [allWords, setAllWords] = useState<SavedWord[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('review');
  const [isFreestyle, setIsFreestyle] = useState(false);
  const [studyLang, setStudyLang] = useState<SavedWord['language'] | 'all'>('all');
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [queue, setQueue] = useState<SavedWord[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState({ known: 0, unknown: 0 });

  const wordsForLang = (words: SavedWord[]) => {
    if (studyLangRef.current === 'all') return words;
    return words.filter((w) => w.language === studyLangRef.current);
  };

  const startSession = (words: SavedWord[]) => {
    setIsFreestyle(false);
    requeuedRef.current = new Set();
    const forLang = wordsForLang(words);
    if (forLang.length === 0) { setStatus(studyLangRef.current === 'all' ? 'empty' : 'empty-lang'); return; }
    const due = [...filterDue(forLang)].sort(() => Math.random() - 0.5);
    if (due.length === 0) {
      setNextDue(nextDueDate(forLang));
      setStatus('caught-up');
    } else {
      setQueue(due);
      setIndex(0);
      setResults({ known: 0, unknown: 0 });
      setNextDue(null);
      setStatus('studying');
    }
  };

  const startFreestyle = (words: SavedWord[]) => {
    setIsFreestyle(true);
    requeuedRef.current = new Set();
    const shuffled = [...wordsForLang(words)].sort(() => Math.random() - 0.5);
    if (shuffled.length === 0) { setStatus(studyLangRef.current === 'all' ? 'empty' : 'empty-lang'); return; }
    setQueue(shuffled);
    setIndex(0);
    setResults({ known: 0, unknown: 0 });
    setStatus('studying');
  };

  const backToList = () => {
    getWords(user?.uid ?? null).then(({ words }) => {
      setAllWords(words);
      setStatus('selecting');
    });
  }

  const changeLang = (lang: SavedWord['language'] | 'all') => {
    studyLangRef.current = lang;
    setStudyLang(lang);
    if (isFreestyle) startFreestyle(allWords);
    else startSession(allWords);
  };

  useEffect(() => {
    getWords(user?.uid ?? null).then(({ words }) => {
      setAllWords(words);
      setStatus(words.length === 0 ? 'empty' : 'selecting');
    });
  }, [user]);

  const advance = (known: boolean) => {
    const word = queue[index];

    if (known) {
      if (!isFreestyle && !requeuedRef.current.has(word.id)) {
        const patch = promoteWord(word);
        updateWordInExtension(word.id, patch);
        setQueue((q) => q.map((w, i) => (i === index ? { ...w, ...patch } : w)));
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
      if (!isFreestyle) {
        const patch = demoteWord();
        updateWordInExtension(word.id, patch);
        setQueue((q) => q.map((w, i) => (i === index ? { ...w, ...patch } : w)));
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

  if (status === 'selecting') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allDueCount = filterDue(allWords).length;

    return (
      <div className="max-w-lg mx-auto px-4 py-12 flex flex-col gap-6">
        <div className="flex gap-2 justify-center">
          {(['review', 'freestyle'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSelectionMode(m)}
              className={`px-4 py-1.5 rounded-full text-sm border transition-colors cursor-pointer ${selectionMode === m
                  ? 'bg-yellow-400 text-black border-yellow-400 font-medium'
                  : 'border-white/20 text-white/60 hover:border-yellow-400 hover:text-yellow-400'
                }`}
            >
              {m === 'review' ? 'Review' : 'Freestyle'}
            </button>
          ))}
        </div>

        {selectionMode === 'review' && allDueCount === 0 && (
          <p className="text-center text-white/40 text-sm">
            All caught up ·{' '}
            <button
              onClick={() => setSelectionMode('freestyle')}
              className="text-white/60 hover:text-yellow-400 underline cursor-pointer transition-colors"
            >
              try freestyle
            </button>
          </p>
        )}

        <div className="flex flex-col gap-3">
          {STUDY_LANGS.map((lang) => {
            const words = lang.value === 'all'
              ? allWords
              : allWords.filter((w) => w.language === lang.value);
            const dueCount = filterDue(words).length;
            const disabled = selectionMode === 'review' ? dueCount === 0 : words.length === 0;

            return (
              <button
                key={lang.value}
                disabled={disabled}
                onClick={() => {
                  studyLangRef.current = lang.value;
                  setStudyLang(lang.value);
                  if (selectionMode === 'freestyle') startFreestyle(allWords);
                  else startSession(allWords);
                }}
                className="group flex items-center justify-between px-6 py-4 rounded-2xl border border-white/10 text-left transition-all hover:border-yellow-400/60 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <span className="text-white/80 text-base">{lang.label}</span>
                <div className="flex items-center gap-4">
                  <span className={`text-sm tabular-nums ${selectionMode === 'review'
                      ? dueCount > 0 ? 'text-white/50' : 'text-white/25'
                      : 'text-white/50'
                    }`}>
                    {selectionMode === 'review'
                      ? `${dueCount} due`
                      : `${words.length} words`}
                  </span>
                  <div className="w-8 h-8 rounded-full border border-white/20 group-hover:border-yellow-400 group-hover:text-yellow-400 text-white/30 flex items-center justify-center transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const langLabel = STUDY_LANGS.find((l) => l.value === studyLang)?.label ?? studyLang;
  if (status === 'empty-lang') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col gap-8">
        <div className="flex items-center justify-between text-sm text-white/40 min-h-5" />
        <LangSwitcher value={studyLang} onChange={changeLang} />
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-full max-w-lg min-h-48 border border-white/10 rounded-2xl p-8 bg-white/5 text-center flex flex-col items-center justify-center text-white/60">
            No words saved in {langLabel}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'caught-up') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col gap-8">
        <div className="flex items-center justify-between text-sm text-white/40 min-h-5" />
        <LangSwitcher value={studyLang} onChange={changeLang} />
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-full max-w-lg min-h-48 border border-white/10 rounded-2xl p-8 bg-white/5 text-center flex flex-col items-center justify-center gap-2 text-white/60">
            All caught up
            {nextDue && <span className="text-sm">Next review {formatDueDate(nextDue)}</span>}
          </div>
          <button
            onClick={() => startFreestyle(allWords)}
            className="px-8 py-2 rounded-full border border-white/20 text-white/60 hover:border-white/40 hover:text-white/80 transition-colors text-sm font-medium cursor-pointer"
          >
            Freestyle practice
          </button>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    const total = results.known + results.unknown;
    const accuracy = total > 0 ? Math.round((results.known / total) * 100) : 0;
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center gap-6 text-center">
        <h2 className="text-2xl font-semibold">{isFreestyle ? 'Practice complete' : 'Session complete'}</h2>
        <div className="flex gap-8 text-lg">
          <div>
            <span className="text-green-400 font-semibold">{results.known}</span>
            <span className="text-white/50 ml-1">known</span>
          </div>
          <div>
            <span className="text-red-400 font-semibold">{results.unknown}</span>
            <span className="text-white/50 ml-1">unknown</span>
          </div>
        </div>
        {isFreestyle && (
          <div className="text-white/40 text-sm">{total} cards · {accuracy}% accuracy</div>
        )}
        <button
          onClick={() => startFreestyle(allWords)}
          className="mt-2 px-8 py-3 rounded-full border border-white/40 text-white/80 hover:text-yellow-400 hover:border-yellow-400 transition-colors text-sm font-medium cursor-pointer"
        >
          {isFreestyle ? 'Practice again' : 'Freestyle'}
        </button>
        <button
          onClick={backToList}
          className="text-sm hover:text-yellow-400 text-white/80 transition-colors cursor-pointer"
        >
          Back to list
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col gap-8">
      <div className="grid grid-cols-3 items-center text-sm text-white/40 min-h-5">
        <div className="text-left">
          {isFreestyle && (
            <button onClick={backToList} className="hover:text-yellow-400 transition-colors cursor-pointer">← Back to list</button>
          )}
        </div>
        <div className="text-center">Card {index + 1} of {queue.length}{isFreestyle ? ' · freestyle' : ''}</div>
        <div className="text-right">{results.known} known · {results.unknown} unknown</div>
      </div>

      <FlashCard
        key={index}
        word={queue[index]}
        freestyle={isFreestyle}
        onKnown={() => advance(true)}
        onUnknown={() => advance(false)}
      />
    </div>
  );
}
