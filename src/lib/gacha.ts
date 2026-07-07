// Server-only gacha logic: atomic gem debit + roll persistence. Mirrors the
// service-role-only, admin-client pattern used by rooms.ts/rank.ts/stats.ts.
// Never import from a client component.

import { createAdminClient } from "./supabase/admin";
import { DEFAULT_BANNER, rollMany, type Banner } from "./gachaRoll";
import type { GachaRollResultItem } from "./gachaTypes";

export class InsufficientGemsError extends Error {
  constructor() {
    super("ジェムが足りません");
  }
}

export class DailyPullCooldownError extends Error {
  constructor() {
    super("デイリー無料ガチャは24時間に1回までです");
  }
}

export const ROLL_COST: Record<1 | 10, number> = {
  1: 160,
  10: 1440,
};

/** Resolve a banner id to a known Banner, defaulting to DEFAULT_BANNER. */
function resolveBanner(bannerId?: string): Banner {
  if (bannerId && bannerId === DEFAULT_BANNER.id) return DEFAULT_BANNER;
  return DEFAULT_BANNER;
}

export interface RollOutcome {
  results: GachaRollResultItem[];
  gemsRemaining: number;
}

/**
 * Roll `count` pulls, persist player_characters/gacha_pulls, and update pity.
 * `startingPity` must already reflect an atomically-claimed roll (gem debit
 * or daily-pull gate already succeeded before this is called).
 * `gemsAfterDebit` is what the atomic debit step returned (or, for the free
 * daily pull, the balance is unchanged so the caller passes the current
 * balance through).
 */
/** How many times to re-roll if a concurrent roll advanced pity under us. */
const PITY_CAS_MAX_ATTEMPTS = 6;

async function persistRoll(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  banner: Banner,
  count: number,
  startingPity: number,
  gemsAfterDebit: number,
): Promise<RollOutcome> {
  // Roll + persist under a pity CAS: the pity write only lands if pity_count is
  // still the value we rolled from (apply_gacha_pull_batch_v2, 0008). If a
  // concurrent roll for the same user advanced pity first, the RPC returns
  // false, we re-read the committed pity and re-roll from it. This closes the
  // read→compute→write race that let concurrent requests mint multiple
  // guaranteed SSRs from a single pity (or clobber each other's pity progress).
  let currentPity = startingPity;
  for (let attempt = 0; attempt < PITY_CAS_MAX_ATTEMPTS; attempt++) {
    const { outcomes, pityNew } = rollMany(count, currentPity, banner);

    // Snapshot ownership BEFORE the grant, purely to compute the display-only
    // "isNew" flag (a stale read here at worst mislabels isNew for one response;
    // the grant itself is atomic and idempotent in the RPC).
    const uniqueIds = Array.from(new Set(outcomes.map((o) => o.characterId)));
    const { data: existingRows } = await admin
      .from("player_characters")
      .select("character_id")
      .eq("user_id", userId)
      .in("character_id", uniqueIds);
    const ownedBefore = new Set((existingRows ?? []).map((r) => r.character_id));

    const { data: applied, error: applyErr } = await admin.rpc("apply_gacha_pull_batch_v2", {
      p_user_id: userId,
      p_character_ids: outcomes.map((o) => o.characterId),
      p_pity_expected: currentPity,
      p_pity_new: pityNew,
    });
    if (applyErr) throw applyErr;

    if (applied !== true) {
      // Stale pity — another roll landed first. Re-read the committed value and
      // re-roll from it. No characters were granted for this rejected attempt.
      const { data: fresh } = await admin
        .from("player_gems")
        .select("pity_count")
        .eq("user_id", userId)
        .maybeSingle();
      currentPity = (fresh?.pity_count as number | undefined) ?? currentPity;
      continue;
    }

    const seenInBatch = new Set<string>();
    const results: GachaRollResultItem[] = outcomes.map((outcome) => {
      const isNew = !ownedBefore.has(outcome.characterId) && !seenInBatch.has(outcome.characterId);
      seenInBatch.add(outcome.characterId);
      return { characterId: outcome.characterId, rarity: outcome.rarity, isNew };
    });

    await admin.from("gacha_pulls").insert(
      outcomes.map((o) => ({
        user_id: userId,
        banner_id: banner.id,
        character_id: o.characterId,
        rarity: o.rarity,
        pity_at: o.pityAt,
      })),
    );

    return { results, gemsRemaining: gemsAfterDebit };
  }

  // Extremely unlikely: pity kept shifting under us every attempt. The gems were
  // already debited, so surface a retryable error rather than silently dropping.
  throw new Error("ガチャの確定に失敗しました。もう一度お試しください。");
}

/**
 * Paid gacha roll: x1 (160 gems) or x10 (1440 gems).
 *
 * Atomicity for the gem debit: `debit_gems_for_roll` (0006_gacha.sql) is a
 * single SQL UPDATE guarded by `gems >= p_cost` in its WHERE clause, run
 * through the service-role client. Two concurrent requests racing the same
 * balance can never both succeed — whichever commits first leaves a balance
 * insufficient for the other, so the second UPDATE matches zero rows and
 * returns no data. We treat "no row returned" as insufficient funds. Only
 * after this debit succeeds do we compute rolls and write
 * player_characters/gacha_pulls, then persist the batch's ending pity_count.
 */
export async function rollPaid(
  userId: string,
  count: 1 | 10,
  bannerId?: string,
): Promise<RollOutcome> {
  const admin = createAdminClient();
  const banner = resolveBanner(bannerId);
  const cost = ROLL_COST[count];

  const { data, error } = await admin
    .rpc("debit_gems_for_roll", { p_user_id: userId, p_cost: cost })
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new InsufficientGemsError();
  const debited = data as { gems: number; pity_count: number };

  return persistRoll(admin, userId, banner, count, debited.pity_count, debited.gems);
}

/**
 * Free 24h-gated daily pull (single pull, same result shape as rollPaid).
 *
 * Atomicity: `claim_daily_pull` is a single UPDATE guarded by
 * `daily_pull_at IS NULL OR daily_pull_at <= now() - 24h`. Concurrent
 * requests can't both win: the first commit's fresh `daily_pull_at` makes the
 * second UPDATE's WHERE clause fail, returning zero rows.
 */
export async function rollDaily(userId: string, bannerId?: string): Promise<RollOutcome> {
  const admin = createAdminClient();
  const banner = resolveBanner(bannerId);

  const { data, error } = await admin.rpc("claim_daily_pull", { p_user_id: userId }).maybeSingle();
  if (error) throw error;
  if (!data) throw new DailyPullCooldownError();
  const claimed = data as { pity_count: number };

  const { data: gemsRow } = await admin
    .from("player_gems")
    .select("gems")
    .eq("user_id", userId)
    .maybeSingle();

  return persistRoll(admin, userId, banner, 1, claimed.pity_count, gemsRow?.gems ?? 0);
}
