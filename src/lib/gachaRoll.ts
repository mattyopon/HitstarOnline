// Gacha roll algorithm (data-model.md "レアリティ抽選アルゴリズム").
//
// SERVER-ONLY: this module uses Math.random() and is meant to be imported
// exclusively by a service-role-authenticated API route (e.g. a future
// /api/gacha/roll). It is intentionally NOT part of src/lib/engine.ts's
// deterministic, injected-RNG game state machine — gacha rolls are not
// game-outcome-affecting and don't need replay determinism, so a fresh
// Math.random() per roll is fine here. Do not import this from client
// components or from engine.ts.

import { GACHA_CHARS, type Character, type Rarity } from "./gachaChars";
import { PICKUP_RATE, PITY_THRESHOLD, RARITY_RATES } from "./rarity";

export interface Banner {
  id: string;
  /** Display name shown on the Gacha screen header (e.g. "Showa Genesis"). */
  name: string;
  /** SSR character id boosted by the 50/50 pickup rule. */
  pickupCharacterId: string;
}

// Single default banner. The pickup character (and thus its rarity) is
// configurable here via `pickupCharacterId` — swapping banners is just a
// matter of pointing this at a different character id and updating `name`.
//
// IMPORTANT: the pickup MUST be an SSR character. pickCharacter() only applies
// the 50/50 PICKUP_RATE boost on SSR rolls, so a non-SSR pickup would never be
// boosted and the "pickup" would be meaningless. We use "synthea" (Synthea
// Neon, SSR, 1980s) — a Shōwa-era SSR that fits the "Showa Genesis" banner.
// GachaScreen.tsx derives all featured/pickup art, the banner name, and the
// SSR-star pill from this same DEFAULT_BANNER, so the screen and roll algorithm
// always agree on which character is being pushed.
export const DEFAULT_BANNER: Banner = {
  id: "showa_genesis",
  name: "Showa Genesis",
  pickupCharacterId: "synthea", // must be an SSR id (see note above)
};

export interface RollResult {
  rarity: Rarity;
  pityNew: number;
}

/**
 * Resolve a single pull's rarity given the roller's current pity counter.
 * Pity forces SSR once pityCount reaches PITY_THRESHOLD; otherwise rolls
 * against RARITY_RATES (SSR 3% / SR 12% / R 85%).
 */
export function rollOne(pityCount: number): RollResult {
  if (pityCount >= PITY_THRESHOLD) {
    return { rarity: "SSR", pityNew: 0 };
  }
  const r = Math.random();
  if (r < RARITY_RATES.SSR) {
    return { rarity: "SSR", pityNew: 0 };
  }
  if (r < RARITY_RATES.SSR + RARITY_RATES.SR) {
    return { rarity: "SR", pityNew: pityCount + 1 };
  }
  return { rarity: "R", pityNew: pityCount + 1 };
}

/**
 * Pick a specific character id for a resolved rarity tier. SSR rolls have a
 * PICKUP_RATE (50%) chance of resolving to the banner's pickup character;
 * otherwise (or for SR/R) a uniformly random character of that rarity from
 * the pool is chosen.
 */
export function pickCharacter(rarity: Rarity, banner: Banner, pool: readonly Character[] = GACHA_CHARS): string {
  const filtered = pool.filter((c) => c.rarity === rarity);
  if (filtered.length === 0) {
    throw new Error(`gachaRoll: no characters of rarity ${rarity} in pool`);
  }
  if (rarity === "SSR" && banner.pickupCharacterId) {
    if (Math.random() < PICKUP_RATE) {
      return banner.pickupCharacterId;
    }
  }
  return filtered[Math.floor(Math.random() * filtered.length)].id;
}

export interface PullOutcome {
  characterId: string;
  rarity: Rarity;
  pityAt: number;
}

/**
 * Roll `count` pulls in sequence, threading the pity counter through each
 * pull. Returns the outcomes plus the final pity counter to persist.
 */
export function rollMany(count: number, startingPity: number, banner: Banner = DEFAULT_BANNER, pool: readonly Character[] = GACHA_CHARS): { outcomes: PullOutcome[]; pityNew: number } {
  let pity = startingPity;
  const outcomes: PullOutcome[] = [];
  for (let i = 0; i < count; i++) {
    const pityAt = pity;
    const { rarity, pityNew } = rollOne(pity);
    const characterId = pickCharacter(rarity, banner, pool);
    outcomes.push({ characterId, rarity, pityAt });
    pity = pityNew;
  }
  return { outcomes, pityNew: pity };
}
