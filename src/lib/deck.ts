import deckData from "../../data/deck.json";
import { Song } from "./protocol";

const DECK: Song[] = deckData as Song[];

export function getDeck(): Song[] {
  return DECK;
}

export function deckSize(): number {
  return DECK.length;
}

/** Stable cache key for a song (used by the YouTube id cache). */
export function deckKey(song: Song): string {
  return `${song.title}|${song.artist}`.toLowerCase().replace(/\s+/g, " ").trim();
}

/** A search query likely to surface the official audio/video on YouTube. */
export function searchQuery(song: Song): string {
  return `${song.artist} ${song.title} official audio`;
}

function randInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

function inCategories(song: Song, set: Set<string> | null): boolean {
  if (!set) return true;
  const cats = song.categories ?? [];
  return cats.some((c) => set.has(c));
}

/** How many songs match the given categories (empty/undefined = all). */
export function countInCategories(categories?: string[]): number {
  const set = categories && categories.length ? new Set(categories) : null;
  return DECK.reduce((n, s) => n + (inCategories(s, set) ? 1 : 0), 0);
}

/**
 * A freshly shuffled draw order over deck indices (Fisher–Yates), optionally
 * filtered to the given categories. CRITICAL: returns GLOBAL indices into the
 * full deck (songId == getDeck() index), never a re-indexed subset.
 */
export function shuffledDeckOrder(categories?: string[]): number[] {
  const set = categories && categories.length ? new Set(categories) : null;
  const arr = DECK.map((_, i) => i).filter((i) => inCategories(DECK[i], set));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
