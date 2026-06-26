import { json, mapError, requireUser, seedFrom } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureRank } from "@/lib/rank";
import { createRoom, joinRoom } from "@/lib/rooms";
import type { PublicState } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANKED_MAX_PLAYERS = 4;
const FRESH_MS = 5 * 60 * 1000; // ignore lobbies older than 5 min

/**
 * POST /api/rank/matchmake → { code }
 * Tier-bucketed find-or-create over the EXISTING room system.
 *  1. Reject anonymous (guests cannot play ranked).
 *  2. Lazy-create the user's ranking, read their tier.
 *  3. Find an open, fresh, non-full ranked lobby of that tier → join it.
 *  4. Else create a new ranked lobby (tier fixed at creation by createRoom).
 * Concurrency: joinRoom's optimistic-version retry serializes simultaneous
 * callers; a filled/started room just falls through to the next candidate or a
 * fresh create. A rare double-create yields two half-full lobbies that later fill.
 */
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (user.isAnonymous) {
    return json({ error: "ランクマッチには Google ログインが必要です" }, 403);
  }

  try {
    const rank = await ensureRank(user.id);
    const admin = createAdminClient();
    const seed = seedFrom(user);

    const { data: rooms } = await admin
      .from("rooms")
      .select("code, state, created_at")
      .eq("ranked", true)
      .eq("tier", rank.tier)
      .eq("status", "lobby")
      .gt("created_at", new Date(Date.now() - FRESH_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(5);

    for (const r of rooms ?? []) {
      const st = r.state as PublicState;
      if (st.phase !== "lobby") continue;
      // Already in this room → just return it.
      if (st.players.some((p) => p.userId === user.id)) return json({ code: r.code });
      if (st.players.length >= RANKED_MAX_PLAYERS) continue;
      try {
        await joinRoom(r.code, seed); // retries on version conflict internally
        return json({ code: r.code });
      } catch {
        continue; // raced / filled / started — try the next candidate
      }
    }

    // None joinable → create a fresh ranked lobby (ranked forces expert rules).
    const { code } = await createRoom(seed, { ranked: true, mode: "expert", categories: [] });
    return json({ code });
  } catch (e) {
    return mapError(e);
  }
}
