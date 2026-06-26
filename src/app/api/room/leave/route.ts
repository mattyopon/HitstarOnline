import { json, mapError, readBody, requireUser } from "@/lib/api";
import { leaveRoom } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return json({ error: "部屋コードがありません" }, 400);
  try {
    await leaveRoom(code, user.id);
    return json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
