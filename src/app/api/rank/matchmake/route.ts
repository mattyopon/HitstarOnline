import { json, mapError, readBody, requireUser, seedFrom } from "@/lib/api";
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
 *  1. Lazy-create the user's ranking, read their tier (guests included).
 *  2. Find an open, fresh, non-full ranked lobby of that tier → join it.
 *  3. Else create a new ranked lobby (tier fixed at creation by createRoom).
 * Ranked is open to everyone (guests too); the ladder keys on the user id,
 * which exists for anonymous sessions as well.
 * Concurrency: joinRoom's optimistic-version retry serializes simultaneous
 * callers; a filled/started room just falls through to the next candidate or a
 * fresh create. A rare double-create yields two half-full lobbies that later fill.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  try {
    const body = await readBody(req);
    const rank = await ensureRank(user.id);
    const admin = createAdminClient();
    const seed = seedFrom(user, body.name);

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
