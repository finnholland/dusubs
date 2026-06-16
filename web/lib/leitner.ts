import { SavedWord } from '../types';

const BOX_INTERVALS = [1, 2, 4, 8, 16]; // days per box (index = box - 1)

function today(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function daysAgo(ms: number): number {
  return Math.floor((today() - ms) / 86400000);
}

export function isDue(word: SavedWord): boolean {
  if (word.lastReviewed === null) return true;
  return daysAgo(word.lastReviewed) >= BOX_INTERVALS[word.leitnerBox - 1];
}

export function promoteWord(word: SavedWord): Partial<SavedWord> {
  const now = Date.now();
  const newBox = Math.min(word.leitnerBox + 1, 5) as SavedWord['leitnerBox'];
  return {
    leitnerBox: newBox,
    lastReviewed: now,
    nextReview: now + BOX_INTERVALS[newBox - 1] * 86400000,
  };
}

export function demoteWord(): Partial<SavedWord> {
  const now = Date.now();
  return {
    leitnerBox: 1,
    lastReviewed: now,
    nextReview: now + BOX_INTERVALS[0] * 86400000,
  };
}

export function filterDue(words: SavedWord[]): SavedWord[] {
  return words.filter(isDue);
}

export function nextDueDate(words: SavedWord[]): string | null {
  let earliest: number | null = null;
  for (const w of words) {
    if (w.lastReviewed === null) return null; // never reviewed = always due
    const intervalMs = BOX_INTERVALS[w.leitnerBox - 1] * 86400000;
    const due = w.lastReviewed + intervalMs;
    if (earliest === null || due < earliest) earliest = due;
  }
  if (earliest === null) return null;
  const d = new Date(earliest);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDueDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}
