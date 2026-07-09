import { buildVoteStartOrder, json } from "@/lib/api";
import { getDeck } from "@/lib/deck";
import { abandonIfNoHumans, advance, startFromVote } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConflictError, mutateByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An in-game room with no state write for this long AND no connected human is
 *  treated as abandoned (everyone closed their tab) and force-ended. */
const ABANDON_IDLE_MS = 30 * 60 * 1000; // 30 min
/** Finished/lobby rooms this old are deleted to reclaim rows. */
const STALE_DELETE_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Server-driven phase advance: progresses rooms whose phase deadline has passed,
 * independent of any connected client (so a room can't freeze if everyone left).
 * Triggered on a schedule (Supabase pg_cron via pg_net, or any uptime pinger).
 * Auth via the CRON_SECRET shared secret.
 *
 * Also GC's the room table: abandoned in-game rooms (idle + no connected human)
 * are force-ended so they don't churn through the whole deck, and long-finished
 * or never-started rooms are deleted.
 */
async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "cron not configured" }, 503);
  const provided =
    req.headers.get("x-cron-secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return json({ error: "unauthorized" }, 401);

  const admin = createAdminClient();
  // Oldest-deadline first so a backlog can't starve rooms past the limit(200)
  // window (previously an unordered scan could repeatedly skip the same rooms).
  const { data, error } = await admin
    .from("rooms")
    .select("code, state, updated_at")
    .in("status", ["voting", "placing", "stealing", "reveal"])
    .order("updated_at", { ascending: true })
    .limit(200);
  if (error) return json({ error: error.message }, 500);

  const now = Date.now();
  const songs = getDeck();

  type RoomRow = { code: string; state: RoomState; updated_at?: string };
  type RoomState = {
    deadline?: number;
    phase?: string;
    players?: { isBot?: boolean; connected?: boolean }[];
  };
  const idleSince = (r: RoomRow) => (r.updated_at ? now - new Date(r.updated_at).getTime() : 0);
  const noHuman = (st: RoomState) => !(st?.players || []).some((p) => p?.connected && !p?.isBot);

  const rows = (data || []) as RoomRow[];
  // Abandoned = idle past the threshold with no connected human → force-end.
  const abandoned = rows.filter((r) => noHuman(r.state) && idleSince(r) >= ABANDON_IDLE_MS);
  const abandonedCodes = new Set(abandoned.map((r) => r.code));

  const due = rows.filter((r) => {
    if (abandonedCodes.has(r.code)) return false; // handled by the abandon pass
    const st = r.state;
    if (typeof st?.deadline === "number" && st.deadline <= now) return true;
    // Rooms with NPCs: step bots even before the deadline (backgrounded solo).
    const hasBot = (st?.players || []).some((p) => p?.isBot);
    return hasBot && (st?.phase === "placing" || st?.phase === "stealing");
  });

  let ended = 0;
  for (const r of abandoned) {
    try {
      await mutateByCode(r.code, (g) => abandonIfNoHumans(g));
      ended++;
    } catch (e) {
      if (!(e instanceof ConflictError)) console.error("[cron] abandon failed for", r.code, e);
    }
  }

  let advanced = 0;
  for (const r of due) {
    try {
      await mutateByCode(r.code, (g) => {
        // Voting deadline backstop: resolve the genre vote and start (idempotent,
        // deterministic per state → safe under CAS). Other phases use advance.
        if (g.public.phase === "voting") {
          if ((g.public.deadline ?? Infinity) > Date.now()) return g;
          return startFromVote(g, buildVoteStartOrder(g), songs, Date.now());
        }
        return advance(g, songs, Date.now());
      });
      advanced++;
    } catch (e) {
      if (!(e instanceof ConflictError)) {
        console.error("[cron] advance failed for", r.code, e);
      }
    }
  }

  // Reclaim rows: finished (gameover) or never-started (lobby) rooms untouched
  // for a day. Version isn't checked — these phases don't advance, so there's no
  // race with gameplay; a fresh lobby is well under the cutoff.
  let deleted = 0;
  const cutoff = new Date(now - STALE_DELETE_MS).toISOString();
  const { data: del } = await admin
    .from("rooms")
    .delete()
    .in("status", ["gameover", "lobby"])
    .lt("updated_at", cutoff)
    .select("code"); // cascade clears secrets/members/etc.
  deleted = del?.length ?? 0;

  return json({ ok: true, scanned: rows.length, due: due.length, advanced, ended, deleted });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
