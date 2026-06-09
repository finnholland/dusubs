import { SavedWord } from '../types';

const STORAGE_KEY = 'dusubs:leitner';
const BOX_INTERVALS = [1, 2, 4, 8, 16]; // days per box (index = box - 1)

export interface LeitnerEntry {
  box: number;
  lastReviewed: string; // YYYY-MM-DD local date
}

export type LeitnerProgress = Record<string, LeitnerEntry>;

export function loadProgress(): LeitnerProgress {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveProgress(progress: LeitnerProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseLocal(b).getTime() - parseLocal(a).getTime()) / 86400000);
}

function addDays(dateStr: string, days: number): string {
  const d = parseLocal(dateStr);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isDue(entry: LeitnerEntry | undefined, today: string): boolean {
  if (!entry) return true;
  return daysBetween(entry.lastReviewed, today) >= BOX_INTERVALS[entry.box - 1];
}

export function promote(entry: LeitnerEntry | undefined, today: string): LeitnerEntry {
  return { box: Math.min((entry?.box ?? 1) + 1, 5), lastReviewed: today };
}

export function demote(today: string): LeitnerEntry {
  return { box: 1, lastReviewed: today };
}

export function filterDue(words: SavedWord[], progress: LeitnerProgress, today: string): SavedWord[] {
  return words.filter((w) => isDue(progress[w.id], today));
}

// Returns the earliest date any card in progress is next due, or null if progress is empty.
export function nextDueDate(progress: LeitnerProgress): string | null {
  let earliest: string | null = null;
  for (const entry of Object.values(progress)) {
    const due = addDays(entry.lastReviewed, BOX_INTERVALS[entry.box - 1]);
    if (!earliest || due < earliest) earliest = due;
  }
  return earliest;
}
