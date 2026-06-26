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
  try {
    // Casual and ranked are both open to everyone (guests included).
    // Return the public state so a reconnecting client can resync immediately.
    const game = await joinRoom(code, seedFrom(user, body.name));
    return json({ code, state: game.public });
  } catch (e) {
    return mapError(e);
  }
}
