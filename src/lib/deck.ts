import deckData from "../../data/deck.json";
import { Song } from "./protocol";
import { mulberry32 } from "./engine";

const DECK: Song[] = deckData as Song[];

export function getDeck(): Song[] {
  return DECK;
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

/** How many songs the deck holds for a given category filter (empty = all). */
export function deckSizeForCategories(categories?: string[]): number {
  const set = categories && categories.length ? new Set(categories) : null;
  let n = 0;
  for (const song of DECK) if (inCategories(song, set)) n++;
  return n;
}

/**
 * A shuffled draw order over deck indices (Fisher–Yates), optionally filtered to
 * the given categories. CRITICAL: returns GLOBAL indices into the full deck
 * (songId == getDeck() index), never a re-indexed subset.
 *
 * When `seed` is a finite number the shuffle is DETERMINISTIC (seeded mulberry32)
 * — required for the vote-start path, which runs inside the CAS retry loop and
 * must produce the same deck on every re-run. Otherwise crypto RNG is used.
 */
export function shuffledDeckOrder(categories?: string[], seed?: number): number[] {
  const set = categories && categories.length ? new Set(categories) : null;
  const arr = DECK.map((_, i) => i).filter((i) => inCategories(DECK[i], set));
  const rng = typeof seed === "number" && Number.isFinite(seed) ? mulberry32(seed) : null;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng ? Math.floor(rng() * (i + 1)) : randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
