import { extractCode, json, mapError, readBody, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/friends/invite { friendId, code } → { ok }
 * Deliver a "join my room" ping to a friend, in-app. Server-authoritative:
 *  - the recipient must actually be a friend (friendships edge exists),
 *  - the room must exist, still be running, and the CALLER must be in it
 *    (stops using invites to spam arbitrary codes at people).
 * One live invite per (from,to) pair — re-inviting replaces the previous ping.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const friendId = typeof body.friendId === "string" ? body.friendId : "";
  const code = extractCode(body);
  if (!friendId) return json({ error: "招待相手を指定してください" }, 400);
  if (!code) return json({ error: "先に部屋を作ってから招待してください" }, 400);

  try {
    const admin = createAdminClient();

    const [a, b] = user.id < friendId ? [user.id, friendId] : [friendId, user.id];
    const { data: edge, error: edgeErr } = await admin
      .from("friendships")
      .select("user_a")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    if (edgeErr) throw edgeErr;
    if (!edge) return json({ error: "フレンドにのみ招待を送れます" }, 403);

    const room = await loadByCode(code);
    if (!room || room.game.public.phase === "gameover") {
      return json({ error: "部屋が見つかりません。先に部屋を作ってください" }, 404);
    }
    if (!room.game.public.players.some((p) => p.userId === user.id)) {
      return json({ error: "自分が参加している部屋にのみ招待できます" }, 403);
    }

    const { error: upErr } = await admin
      .from("room_invites")
      .upsert(
        {
          from_user: user.id,
          to_user: friendId,
          room_code: room.game.public.code,
          created_at: new Date().toISOString(),
        },
        { onConflict: "from_user,to_user" },
      );
    if (upErr) throw upErr;

    return json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
