import { json, mapError, requireUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/friends/heartbeat → { ok: true }
 * No body. Bumps the caller's profiles.last_seen_at via the self-scoped
 * touch_last_seen() RPC (granted to authenticated). Best-effort presence — the
 * client swallows failures and just re-tries on the next interval tick.
 */
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("touch_last_seen");
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
