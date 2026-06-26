import { json } from "@/lib/api";
import { getDeck } from "@/lib/deck";
import { advance } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConflictError, mutateByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-driven phase advance: progresses rooms whose phase deadline has passed,
 * independent of any connected client (so a room can't freeze if everyone left).
 * Triggered on a schedule (Supabase pg_cron via pg_net, or any uptime pinger).
 * Auth via the CRON_SECRET shared secret.
 */
async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "cron not configured" }, 503);
  const provided =
    req.headers.get("x-cron-secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return json({ error: "unauthorized" }, 401);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rooms")
    .select("code, state")
    .in("status", ["placing", "stealing", "reveal"])
    .limit(200);
  if (error) return json({ error: error.message }, 500);

  const now = Date.now();
  const songs = getDeck();
  const due = (data || []).filter((r) => {
    const st = r.state as {
      deadline?: number;
      phase?: string;
      players?: { isBot?: boolean }[];
    };
    if (typeof st?.deadline === "number" && st.deadline <= now) return true;
    // Rooms with NPCs: step bots even before the deadline (backgrounded solo).
    const hasBot = (st?.players || []).some((p) => p?.isBot);
    return hasBot && (st?.phase === "placing" || st?.phase === "stealing");
  });

  let advanced = 0;
  for (const r of due) {
    try {
      await mutateByCode(r.code as string, (g) => advance(g, songs, Date.now()));
      advanced++;
    } catch (e) {
      if (!(e instanceof ConflictError)) {
        console.error("[cron] advance failed for", r.code, e);
      }
    }
  }
  return json({ ok: true, scanned: data?.length ?? 0, due: due.length, advanced });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
