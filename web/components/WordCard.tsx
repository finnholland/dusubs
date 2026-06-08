'use client';

import { SavedWord } from '../types';
import { trimDefinition } from '@/lib/words';
interface Props {
  word: SavedWord;
  onDelete: (id: string, zh?: string) => void;
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

export default function WordCard({ word, onDelete }: Props) {
  const timestampUrl = word.url.includes('t=')
    ? word.url
    : `${word.url}${word.url.includes('?') ? '&' : '?'}t=${word.ts}`;

  return (
    <div className="border border-white/10 rounded-xl p-4 flex flex-col gap-2 bg-white/5 hover:bg-white/8 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          {word.zh && (
            <span className="text-yellow-400 text-xl font-semibold mr-2">{word.zh}</span>
          )}
          {word.py && (
            <span className="text-white/50 text-sm">{word.py}</span>
          )}
        </div>
        <button
          onClick={() => onDelete(word.id, word.zh)}
          aria-label="Delete word"
          className="text-white/30 hover:text-red-400 transition-colors text-xs shrink-0 cursor-pointer"
        >
          <TrashIcon />
        </button>
      </div>

      <p className="text-white/80 text-sm">{trimDefinition(word.en)}</p>

      {word.sentZh && (
        <p className="text-white/40 text-xs italic border-l-2 border-yellow-400/30 pl-2">{word.sentZh}</p>
      )}
      {word.sentEn && (
        <p className="text-white/30 text-xs italic">{word.sentEn}</p>
      )}

      <a
        href={timestampUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-yellow-400/60 hover:text-yellow-400 text-xs mt-1 transition-colors"
      >
        ▶ Watch clip
      </a>
    </div>
  );
}
