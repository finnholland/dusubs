'use client';

import { SavedWord } from '../types';

const LANGUAGES: { value: SavedWord['language'] | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

interface Props {
  value: SavedWord['language'] | 'all';
  onChange: (lang: SavedWord['language'] | 'all') => void;
}

export default function LanguageFilter({ value, onChange }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.value}
          onClick={() => onChange(lang.value)}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            value === lang.value
              ? 'bg-yellow-400 text-navy border-yellow-400 font-medium'
              : 'border-white/20 text-white/60 hover:border-white/40 hover:text-white'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
