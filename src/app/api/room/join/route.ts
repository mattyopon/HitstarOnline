import { json, mapError, readBody, requireUser, seedFrom } from "@/lib/api";
import { joinRoom } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return json({ error: "部屋コードを入力してください" }, 400);
  // Multiplayer requires a Google account (guests can only play solo).
  if (user.isAnonymous) {
    return json({ error: "みんなで遊ぶには Google ログインが必要です" }, 403);
  }
  try {
    await joinRoom(code, seedFrom(user, body.name));
    return json({ code });
  } catch (e) {
    return mapError(e);
  }
}
