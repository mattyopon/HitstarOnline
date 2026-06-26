// ───────────────────────────────────────────────────────────────────────────
// Shared rank / tier model.
//
// The PURE exports (TIER_LIST, applyResult, labels/colors, isTier, tierIndex,
// defaultRank, formatRank) are CLIENT-SAFE. The async DB helpers (getUserRank /
// getTierForUser / ensureRank) are SERVER-ONLY — they lazily `import()` the
// service-role admin client inside the function body, so the bundler never pulls
// server-only code into a client component that only uses the pure exports.
//
// The ladder + LP rules MUST stay in sync with apply_rank_result() in
// supabase/migrations/0005_ranked.sql.
// ───────────────────────────────────────────────────────────────────────────

export const TIER_LIST = [
  "wood",
  "bronze",
  "silver",
  "platinum",
  "diamond",
  "grandmaster",
  "challenger",
] as const;
export type Tier = (typeof TIER_LIST)[number];

export function isTier(s: string | null | undefined): s is Tier {
  return !!s && (TIER_LIST as readonly string[]).includes(s);
}
export function tierIndex(tier: Tier): number {
  return TIER_LIST.indexOf(tier);
}

export const TIER_LABELS: Record<Tier, string> = {
  wood: "ウッド",
  bronze: "ブロンズ",
  silver: "シルバー",
  platinum: "プラチナ",
  diamond: "ダイヤモンド",
  grandmaster: "グランドマスター",
  challenger: "チャレンジャー",
};
export function tierLabel(tier: Tier): string {
  return TIER_LABELS[tier];
}

export const TIER_COLORS: Record<Tier, string> = {
  wood: "#8B7355",
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  platinum: "#5FE6D0",
  diamond: "#5FC8FF",
  grandmaster: "#FFC44D",
  challenger: "#FF4D9D",
};
export function tierColor(tier: Tier): string {
  return TIER_COLORS[tier];
}

export interface UserRank {
  tier: Tier;
  lp: number;
  games: number;
  wins: number;
}
export function defaultRank(): UserRank {
  return { tier: "bronze", lp: 0, games: 0, wins: 0 };
}

/**
 * Pure: apply one match result. Mirrors apply_rank_result() in 0005_ranked.sql
 * EXACTLY. Promotion → reset to 0; demotion → 75; wood floor → 0; challenger
 * apex → capped at 100.
 */
export function applyResult(rank: UserRank, isWinner: boolean): UserRank {
  const idx = tierIndex(rank.tier);
  let lp = rank.lp + (isWinner ? 25 : -20);
  let tier: Tier = rank.tier;

  if (lp >= 100) {
    if (idx < TIER_LIST.length - 1) {
      tier = TIER_LIST[idx + 1];
      lp = 0;
    } else {
      lp = 100; // challenger apex
    }
  } else if (lp < 0) {
    if (idx > 0) {
      tier = TIER_LIST[idx - 1];
      lp = 75;
    } else {
      lp = 0; // wood floor
    }
  }

  return { tier, lp, games: rank.games + 1, wins: rank.wins + (isWinner ? 1 : 0) };
}

export function formatRank(rank: UserRank): string {
  return `${TIER_LABELS[rank.tier]} ${rank.lp}LP`;
}

// ─── Server-only DB helpers (lazy admin import) ──────────────────────────────

/** Read a user's current rank; returns defaultRank() if they have no row yet. */
export async function getUserRank(userId: string): Promise<UserRank> {
  const { createAdminClient } = await import("./supabase/admin");
  const admin = createAdminClient();
  const { data } = await admin
    .from("rankings")
    .select("tier, lp, ranked_games, ranked_wins")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return defaultRank();
  return {
    tier: isTier(data.tier) ? data.tier : "bronze",
    lp: data.lp ?? 0,
    games: data.ranked_games ?? 0,
    wins: data.ranked_wins ?? 0,
  };
}

/** Just the tier string for plumbing into PublicPlayer; defaults to "bronze". */
export async function getTierForUser(userId: string): Promise<Tier> {
  return (await getUserRank(userId)).tier;
}

/** Idempotent lazy-create of a bronze 0 row (used before placing into a tier). */
export async function ensureRank(userId: string): Promise<UserRank> {
  const { createAdminClient } = await import("./supabase/admin");
  const admin = createAdminClient();
  await admin
    .from("rankings")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  return getUserRank(userId);
}
