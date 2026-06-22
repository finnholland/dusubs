'use client';

import { SavedWord } from '../types';

const FLAG: Record<string, string> = {
  zh: '🇨🇳',
  ja: '🇯🇵',
  es: '🇪🇸',
  fr: '🇫🇷',
  en: '🇬🇧',
};

interface Props {
  word: SavedWord;
  onDelete: (id: string, key?: string) => void;
  showLanguage?: boolean;
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

export default function WordCard({ word, onDelete, showLanguage }: Props) {
  const displayWord = word.char;
  const displaySent = word.sentNative;

  const timestampUrl = word.url.includes('t=')
    ? word.url
    : `${word.url}${word.url.includes('?') ? '&' : '?'}t=${word.ts}`;

  return (
    <div className="border border-white/10 rounded-xl p-4 flex flex-col gap-2 bg-white/5 hover:bg-white/8 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          {displayWord && (
            <span className="text-yellow-400 text-xl font-semibold mr-2">{displayWord}</span>
          )}
          {word.py && (
            <span className="text-white/50 text-sm">{word.py}</span>
          )}
        </div>
        <button
          onClick={() => onDelete(word.id, displayWord)}
          aria-label="Delete word"
          className="text-white/30 hover:text-red-400 transition-colors text-xs shrink-0 cursor-pointer"
        >
          <TrashIcon />
        </button>
      </div>

      <p className="text-white/80 text-sm">{word.en}</p>

      {displaySent && (
        <p className="text-white/40 text-xs italic border-l-2 border-yellow-400/30 pl-2">{displaySent}</p>
      )}
      {word.sentOther && (
        <p className="text-white/30 text-xs italic">{word.sentOther}</p>
      )}
      <div className="flex items-center gap-4 mt-2 flex-row width-full justify-between">
        <a
          href={timestampUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-yellow-400/60 hover:text-yellow-400 text-xs mt-1 transition-colors hover:underline self-start"
        >
          ▶ Watch clip
        </a>
        {showLanguage && (
          <span className="leading-none" title={word.language}>{FLAG[word.language] ?? word.language.toUpperCase()}</span>
        )}
      </div>
    </div>
  );
}
