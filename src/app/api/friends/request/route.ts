import { json, mapError, readBody, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Normalize a friend code: trim, uppercase, strip spaces. */
function normalizeCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().replace(/\s+/g, "") : "";
}

/**
 * POST /api/friends/request → { ok: true } (or { ok:true, autoAccepted:true })
 * Body: { code: string } — the target's shareable friend code, the ONLY
 * accepted identifier (no toUserId, to avoid re-introducing uuid enumeration).
 *
 * Flow:
 *   1. Look up the target by friend_code (404 if none).
 *   2. Reject self (400) / already-friends (400).
 *   3. Reverse pending request already exists → auto-accept (become friends).
 *   4. Same-direction pending → idempotent success.
 *   5. Otherwise insert a pending request.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await readBody(req);
  const code = normalizeCode(body.code);
  if (!code) return json({ error: "フレンドコードを入力してください" }, 400);

  try {
    const admin = createAdminClient();

    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("id")
      .eq("friend_code", code)
      .maybeSingle();
    if (targetErr) throw targetErr;
    if (!target) return json({ error: "フレンドコードが見つかりません" }, 404);

    const targetId = target.id as string;
    if (targetId === user.id) {
      return json({ error: "自分自身は追加できません" }, 400);
    }

    // Already friends? (canonical pair)
    const a = user.id < targetId ? user.id : targetId;
    const b = user.id < targetId ? targetId : user.id;
    const { data: existingEdge, error: edgeErr } = await admin
      .from("friendships")
      .select("user_a")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    if (edgeErr) throw edgeErr;
    if (existingEdge) return json({ error: "すでにフレンドです" }, 400);

    // Reverse pending request (them → me)? Auto-accept: create the edge and
    // mark that request accepted, so mutual requests just become friends.
    const { data: reverse, error: revErr } = await admin
      .from("friend_requests")
      .select("id")
      .eq("from_user", targetId)
      .eq("to_user", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (revErr) throw revErr;
    if (reverse) {
      const { error: updErr } = await admin
        .from("friend_requests")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", reverse.id);
      if (updErr) throw updErr;
      const { error: insEdgeErr } = await admin
        .from("friendships")
        .upsert({ user_a: a, user_b: b }, { onConflict: "user_a,user_b" });
      if (insEdgeErr) throw insEdgeErr;
      return json({ ok: true, autoAccepted: true });
    }

    // Same-direction pending (me → them)? Idempotent success.
    const { data: mine, error: mineErr } = await admin
      .from("friend_requests")
      .select("id")
      .eq("from_user", user.id)
      .eq("to_user", targetId)
      .eq("status", "pending")
      .maybeSingle();
    if (mineErr) throw mineErr;
    if (mine) return json({ ok: true });

    const { error: insErr } = await admin
      .from("friend_requests")
      .insert({ from_user: user.id, to_user: targetId, status: "pending" });
    if (insErr) throw insErr;

    return json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
