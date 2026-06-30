import deckData from "../../data/deck.json";
import { CATEGORY_IDS, PACK_IDS, Song, isPackId } from "./protocol";
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

/**
 * Keep only scope ids the server recognizes: the 27 genre categories OR a
 * registered theme pack. Unknown ids (stale/forged) are dropped. Order-stable,
 * de-duplicated. Used by sanitizeSettings so packs and genres both pass through.
 */
export function sanitizeScope(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || seen.has(id)) continue;
    if (CATEGORY_IDS.has(id) || PACK_IDS.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Resolve a (already-sanitized) scope to the EXCLUSIVE deck filter ("縛り").
 * If ANY pack id is selected, the deck is constrained to the pack(s) and genre
 * ids are ignored — selecting a 縛り is a deliberate, dominant choice. Otherwise
 * the genre ids pass through unchanged (empty = all). The returned list is fed
 * to shuffledDeckOrder/deckSizeForCategories, which intersect against songs'
 * categories[] tags (packs are tagged "pack:<slug>" in that same array).
 */
export function resolveScopeFilter(ids: string[]): string[] {
  const packs = ids.filter(isPackId);
  return packs.length ? packs : ids;
}

/** How many songs the deck holds for a given scope filter (empty = all).
 *  A selected pack constrains the deck exclusively (resolveScopeFilter). */
export function deckSizeForCategories(categories?: string[]): number {
  const scope = categories && categories.length ? resolveScopeFilter(categories) : [];
  const set = scope.length ? new Set(scope) : null;
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
  // A selected pack constrains the deck exclusively ("縛り"); otherwise genres
  // pass through. The intersection algorithm below is unchanged.
  const scope = categories && categories.length ? resolveScopeFilter(categories) : [];
  const set = scope.length ? new Set(scope) : null;
  const arr = DECK.map((_, i) => i).filter((i) => inCategories(DECK[i], set));
  const rng = typeof seed === "number" && Number.isFinite(seed) ? mulberry32(seed) : null;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng ? Math.floor(rng() * (i + 1)) : randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
