// Shared TS types for the gacha layer (data-model.md "TypeScript 型").
// Safe to import from both server (API routes) and client (display) code —
// pure type/shape definitions only, no Supabase access here.

import type { Rarity } from "./gachaChars";

export interface PlayerGems {
  gems: number;
  notes: number;
  tokens: number;
  pityCount: number;
  dailyPullAt: string | null;
}

export interface PlayerCharacter {
  characterId: string;
  level: number;
  dupes: number;
  acquiredAt: string;
}

/** Current 5-slot party lineup; null = empty slot. */
export type PlayerParty = (string | null)[];

export interface GachaRollResultItem {
  characterId: string;
  rarity: Rarity;
  isNew: boolean;
}

export interface GachaRollResponse {
  results: GachaRollResultItem[];
  gemsRemaining: number;
}

/** GET /api/character/list response payload. */
export interface CharacterListResponse {
  gems: PlayerGems;
  characters: PlayerCharacter[];
  party: PlayerParty;
}
