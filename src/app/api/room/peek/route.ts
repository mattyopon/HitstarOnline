import { extractCode, json, mapError, readBody, requireUser } from "@/lib/api";
import { loadByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight room existence/phase probe. Lets the Lobby validate its
 * "前の部屋に戻る" banner (the saved code may point at a room that has since
 * been GC'd or finished) without joining. Answer-free: exposes only phase and
 * player count, never state, so peeking reveals nothing an invitee wouldn't
 * see on join anyway. Auth-gated to avoid open room-code scanning.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const code = extractCode(body);
  if (!code) return json({ error: "部屋コードを入力してください" }, 400);
  try {
    const room = await loadByCode(code);
    if (!room) return json({ exists: false });
    const pub = room.game.public;
    return json({
      exists: true,
      phase: pub.phase,
      players: pub.players.length,
      // Whether the caller is already a member (drives "戻る" vs "参加" copy).
      member: pub.players.some((p) => p.userId === user.id),
    });
  } catch (e) {
    return mapError(e);
  }
}
