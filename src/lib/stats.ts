// Player stats & ranked-record recording. SERVER ONLY (service-role admin
// client). Recording is best-effort: failures are swallowed so they can never
// break a game mutation. Bots are never recorded (their ids aren't auth uuids).

import { createAdminClient } from "./supabase/admin";
import { getDeck } from "./deck";
import { CATEGORIES, type Phase, type PublicPlayer, type PublicState } from "./protocol";

function isRealUser(p: PublicPlayer | undefined): p is PublicPlayer {
  return !!p && !p.isBot;
}

function categoriesOf(songId: number | undefined): string[] {
  if (songId === undefined) return [];
  return getDeck()[songId]?.categories ?? [];
}

/** Won cards excludes the starting seed card. */
function wonCards(p: PublicPlayer): number {
  return Math.max(0, p.timeline.length - 1);
}

/**
 * Called from mutateByCode on phase transitions. Records placement accuracy when
 * a card is revealed, and the full match result when the game ends. Idempotent
 * via reveal_events / recorded_matches guards. Never throws.
 */
export async function recordTransitions(
  roomId: string,
  prevPhase: Phase,
  next: PublicState,
): Promise<void> {
  try {
    if (prevPhase !== "reveal" && next.phase === "reveal" && next.reveal) {
      await recordReveal(roomId, next);
    }
    if (prevPhase !== "gameover" && next.phase === "gameover") {
      await recordMatchEnd(roomId, next);
    }
  } catch {
    /* best-effort: stats must never break gameplay */
  }
}

async function recordReveal(roomId: string, state: PublicState): Promise<void> {
  const reveal = state.reveal;
  if (!reveal) return;
  const admin = createAdminClient();

  // Idempotency: count this reveal once even if multiple writers raced.
  const { error: guardErr } = await admin
    .from("reveal_events")
    .insert({ room_id: roomId, version: state.version });
  if (guardErr) return; // 23505 (already recorded) or other → skip

  const cats = categoriesOf(reveal.songId);
  if (cats.length === 0) return;

  const byUser = state.players.reduce<Record<string, PublicPlayer>>((m, p) => {
    m[p.userId] = p;
    return m;
  }, {});

  const attempts: { user: string; correct: boolean }[] = [];
  // Active player: a real placement attempt (skip timeouts and auto-buys).
  const activeId = state.order[state.activeIndex];
  if (reveal.placementSlot !== null && !reveal.bought && isRealUser(byUser[activeId])) {
    attempts.push({ user: activeId, correct: reveal.activeCorrect });
  }
  // Stealers each made a deliberate placement attempt.
  for (const s of reveal.steals) {
    if (isRealUser(byUser[s.userId])) attempts.push({ user: s.userId, correct: s.correct });
  }

  await Promise.all(
    attempts.flatMap((a) =>
      cats.map((category) =>
        admin
          .rpc("bump_category_stat", {
            p_user: a.user,
            p_category: category,
            p_attempts: 1,
            p_correct: a.correct ? 1 : 0,
          })
          .then(() => undefined),
      ),
    ),
  );
}

async function recordMatchEnd(roomId: string, state: PublicState): Promise<void> {
  const admin = createAdminClient();

  // Idempotency: record a given room's game exactly once.
  const { error: guardErr } = await admin
    .from("recorded_matches")
    .insert({ room_id: roomId });
  if (guardErr) return;

  // Rank among ALL players (so beating bots counts), but only persist real users.
  const ranked = [...state.players].sort(
    (a, b) => wonCards(b) - wonCards(a) || b.tokens - a.tokens || a.seat - b.seat,
  );
  const rankOf = new Map(ranked.map((p, i) => [p.userId, i + 1]));

  const { data: match, error: matchErr } = await admin
    .from("matches")
    .insert({
      room_code: state.code,
      mode: state.settings.mode,
      ranked: !!state.settings.ranked,
      categories: state.settings.categories ?? [],
      winner_id: realOrNull(state, state.winnerId ?? null),
      player_count: state.players.length,
    })
    .select("id")
    .single();
  if (matchErr || !match) return;

  const rows = state.players
    .filter(isRealUser)
    .map((p) => ({
      match_id: match.id,
      user_id: p.userId,
      name: p.name,
      rank: rankOf.get(p.userId) ?? state.players.length,
      cards_won: wonCards(p),
      is_winner: state.winnerId === p.userId,
    }));
  if (rows.length) await admin.from("match_players").insert(rows);
}

function realOrNull(state: PublicState, userId: string | null): string | null {
  if (!userId) return null;
  const p = state.players.find((x) => x.userId === userId);
  return isRealUser(p) ? userId : null;
}

export interface CategoryAccuracy {
  category: string;
  labelJa: string;
  attempts: number;
  correct: number;
  accuracy: number;
}

export interface UserStats {
  games: number;
  wins: number;
  winRate: number;
  rankedGames: number;
  rankedWins: number;
  avgRank: number | null;
  totalCards: number;
  strong: CategoryAccuracy[];
  weak: CategoryAccuracy[];
  recent: {
    mode: string;
    ranked: boolean;
    rank: number;
    cardsWon: number;
    isWinner: boolean;
    playerCount: number;
    createdAt: string;
  }[];
}

/** Aggregate a user's stats for the profile/戦績 view. */
export async function getUserStats(userId: string): Promise<UserStats> {
  const admin = createAdminClient();

  const { data: mp } = await admin
    .from("match_players")
    .select("match_id, rank, cards_won, is_winner")
    .eq("user_id", userId)
    .limit(500);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mpRows = (mp ?? []) as any[];
  // Fetch the referenced matches in one query and join in JS (no PostgREST embed).
  const matchIds = [...new Set(mpRows.map((r) => r.match_id))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let matchMap = new Map<string, any>();
  if (matchIds.length) {
    const { data: ms } = await admin
      .from("matches")
      .select("id, mode, ranked, player_count, created_at")
      .in("id", matchIds);
    matchMap = new Map((ms ?? []).map((m) => [m.id, m]));
  }

  const rows = mpRows
    .map((r) => ({ ...r, match: matchMap.get(r.match_id) }))
    .sort((a, b) => String(b.match?.created_at ?? "").localeCompare(String(a.match?.created_at ?? "")));

  const games = rows.length;
  const wins = rows.filter((r) => r.is_winner).length;
  const ranked = rows.filter((r) => r.match?.ranked);
  const rankedWins = ranked.filter((r) => r.is_winner).length;
  const totalCards = rows.reduce((n, r) => n + (r.cards_won ?? 0), 0);
  const avgRank = games ? rows.reduce((n, r) => n + (r.rank ?? 0), 0) / games : null;

  const recent = rows.slice(0, 10).map((r) => ({
    mode: r.match?.mode ?? "original",
    ranked: !!r.match?.ranked,
    rank: r.rank ?? 0,
    cardsWon: r.cards_won ?? 0,
    isWinner: !!r.is_winner,
    playerCount: r.match?.player_count ?? 0,
    createdAt: r.match?.created_at ?? "",
  }));

  const { data: cs } = await admin
    .from("category_stats")
    .select("category, attempts, correct")
    .eq("user_id", userId);

  const labelOf = (id: string) => CATEGORIES.find((c) => c.id === id)?.labelJa ?? id;
  const accuracies: CategoryAccuracy[] = (cs ?? [])
    .filter((c) => (c.attempts ?? 0) >= 3) // enough data to be meaningful
    .map((c) => ({
      category: c.category,
      labelJa: labelOf(c.category),
      attempts: c.attempts,
      correct: c.correct,
      accuracy: c.attempts ? c.correct / c.attempts : 0,
    }));

  const byAcc = [...accuracies].sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);
  const strong = byAcc.slice(0, 3);
  const weak = [...byAcc].reverse().slice(0, 3).filter((w) => !strong.includes(w));

  return {
    games,
    wins,
    winRate: games ? wins / games : 0,
    rankedGames: ranked.length,
    rankedWins,
    avgRank,
    totalCards,
    strong,
    weak,
    recent,
  };
}
