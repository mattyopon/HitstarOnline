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

/** A freshly shuffled draw order over all deck indices (Fisher–Yates). */
export function shuffledDeckOrder(): number[] {
  const arr = DECK.map((_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
