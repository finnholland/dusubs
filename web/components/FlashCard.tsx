'use client';

import { useState } from 'react';
import { SavedWord } from '../types';

interface Props {
  word: SavedWord;
  onKnown: () => void;
  onUnknown: () => void;
  freestyle?: boolean;
}

export default function FlashCard({ word, onKnown, onUnknown, freestyle }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);

  const maxHints = freestyle ? 3 : 1;
  const displayWord = word.char;
  const sentNative = word.sentNative;

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        onClick={() => setFlipped((f) => !f)}
        className="relative w-full max-w-lg min-h-48 border border-white/10 rounded-2xl p-8 bg-white/5 hover:bg-white/8 transition-colors cursor-pointer text-center flex flex-col items-center justify-center gap-1"
      >
        {!flipped && (hintLevel < maxHints || hintLevel === maxHints) && (
          <button
            disabled={hintLevel === maxHints}
            onClick={(e) => { e.stopPropagation(); setHintLevel((h) => h + 1); }}
            className="absolute top-3 right-3 text-xs border rounded-full px-2.5 py-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default text-white/50 hover:text-yellow-400 border-white/30 hover:border-yellow-400 disabled:hover:text-white/50 disabled:hover:border-white/30"
          >
            {freestyle ? `Hint ${hintLevel}/${maxHints}` : (hintLevel === 0 ? 'Hint 0/1' : 'Hint 1/1')}
          </button>
        )}

        {!flipped ? (
          <>
            {displayWord && (
              <span className="text-yellow-400 text-4xl font-semibold">{displayWord}</span>
            )}
            {hintLevel >= 1 && sentNative && (
              <p className="text-white/40 text-sm italic mt-2">{sentNative}</p>
            )}
            {freestyle && hintLevel >= 2 && word.sentEn && (
              <p className="text-white/40 text-sm italic">{word.sentEn}</p>
            )}
            {freestyle && hintLevel >= 3 && word.py && (
              <span className="text-white/50 text-base">{word.py}</span>
            )}
            <span className="text-white/30 text-xs mt-4">tap to reveal</span>
          </>
        ) : (
          <>
            {displayWord && (
              <span className="text-yellow-400/80 text-3xl">{displayWord}</span>
            )}
            {word.py && (
              <span className="text-white/50 text-base">{word.py}</span>
            )}
            <span className="text-white text-xl">{word.en}</span>
            {word.sentEn && (
              <p className="text-white/40 text-sm italic mt-2">{word.sentEn}</p>
            )}
            {sentNative && (
              <p className="text-white/40 text-sm italic">{sentNative}</p>
            )}
          </>
        )}
      </div>

      {flipped && (
        <div className="flex gap-4">
          <button
            onClick={onUnknown}
            className="px-8 py-2 rounded-full border border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
          >
            Not sure
          </button>
          <button
            onClick={onKnown}
            className="px-8 py-2 rounded-full border border-green-400/40 text-green-400 hover:bg-green-400/10 transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
