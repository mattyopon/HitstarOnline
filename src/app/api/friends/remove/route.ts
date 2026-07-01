import { json, mapError, readBody, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/friends/remove → { ok: true }
 * Body: { friendId: string }
 * Deletes the canonical friendship edge (a,b)=sort(user.id, friendId). Because
 * one endpoint of the canonical pair is always the caller, this can only ever
 * remove a friendship the caller is part of. Idempotent (no-op if not friends).
 * Also tidies up any lingering accepted request rows between the two (cosmetic),
 * so a later re-request isn't blocked and stale rows don't accumulate.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await readBody(req);
  const friendId = typeof body.friendId === "string" ? body.friendId : "";
  // friendId flows into a PostgREST .or() filter string below (cosmetic
  // request cleanup), so require a strict UUID shape to preclude filter
  // injection. (user.id is a trusted session UUID and needs no check.)
  if (!friendId || friendId === user.id || !UUID_RE.test(friendId)) {
    return json({ error: "フレンドが見つかりません" }, 400);
  }

  try {
    const admin = createAdminClient();
    const a = user.id < friendId ? user.id : friendId;
    const b = user.id < friendId ? friendId : user.id;

    const { error: delErr } = await admin
      .from("friendships")
      .delete()
      .eq("user_a", a)
      .eq("user_b", b);
    if (delErr) throw delErr;

    // Cosmetic cleanup of any accepted request rows between the pair.
    const { error: reqErr } = await admin
      .from("friend_requests")
      .delete()
      .or(
        `and(from_user.eq.${user.id},to_user.eq.${friendId}),and(from_user.eq.${friendId},to_user.eq.${user.id})`,
      );
    if (reqErr) throw reqErr;

    return json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
