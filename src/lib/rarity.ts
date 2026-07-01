// Rarity color tokens + probability table for the gacha layer.
// Reusable by both client code (display) and server-only roll logic
// (src/lib/gachaRoll.ts). Pure data/constants — no randomness here.

import type { Rarity } from "./gachaChars";

// Mirrors the --ssr-a/--ssr-b/--sr-a/--sr-b/--r-a/--r-b CSS variables in
// globals.css (DESIGN_SPEC.md "rarity (new)" tokens). Kept as plain hex
// strings so non-CSS consumers (e.g. inline SVG, emails, future native
// clients) don't need to read computed styles.
export const RARITY_COLORS: Record<Rarity, { a: string; b: string; glow: string }> = {
  SSR: { a: "#ff8a3d", b: "#ff5a1a", glow: "rgba(255,138,61,.5)" },
  SR: { a: "#bd87ff", b: "#9050d0", glow: "rgba(189,135,255,.4)" },
  R: { a: "#7ec6ff", b: "#3a8ad0", glow: "rgba(126,198,255,.4)" },
};

// Star-count display convention used by the Gacha screen mock.
export const RARITY_STARS: Record<Rarity, number> = {
  SSR: 5,
  SR: 4,
  R: 3,
};

// Base roll probabilities (data-model.md "レアリティ抽選アルゴリズム").
export const RARITY_RATES: Record<Rarity, number> = {
  SSR: 0.03,
  SR: 0.12,
  R: 0.85,
};

// Pity: rolling with pityCount >= this threshold forces an SSR result.
export const PITY_THRESHOLD = 89;

// SSR pickup 50/50: probability that an SSR roll resolves to the banner's
// pickup character instead of a random off-banner SSR.
export const PICKUP_RATE = 0.5;
