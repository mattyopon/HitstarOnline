import { json, mapError, readBody, requireUser } from "@/lib/api";
import { getDeck } from "@/lib/deck";
import { advanceReveal, GameError } from "@/lib/engine";
import { ConflictError, mutateByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Skip the reveal ("▶ 次の曲へ"). The reveal plays the song in full, so any
 * member may advance to the next turn when everyone's ready. Idempotent and
 * server-validated (no-op unless the room is in the reveal phase).
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return json({ error: "部屋コードがありません" }, 400);

  const songs = getDeck();
  const now = Date.now();
  try {
    const result = await mutateByCode(code, (g) => {
      if (!g.public.players.some((p) => p.userId === user.id)) {
        throw new GameError("この部屋のメンバーではありません");
      }
      return advanceReveal(g, songs, now);
    });
    return json({ ok: true, state: result.public });
  } catch (e) {
    if (e instanceof ConflictError) return json({ ok: true });
    return mapError(e);
  }
}
