import { json, mapError, readBody, requireUser } from "@/lib/api";
import { getDeck } from "@/lib/deck";
import { advance, GameError } from "@/lib/engine";
import { ConflictError, mutateByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Advance a timed-out phase (placing/stealing/reveal). Any member may call it;
 * it is idempotent and server-validated against the phase deadline, so racing
 * callers and double-calls are harmless.
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
    await mutateByCode(code, (g) => {
      if (!g.public.players.some((p) => p.userId === user.id)) {
        throw new GameError("この部屋のメンバーではありません");
      }
      return advance(g, songs, now);
    });
    return json({ ok: true });
  } catch (e) {
    // Another client advanced first — that's fine.
    if (e instanceof ConflictError) return json({ ok: true });
    return mapError(e);
  }
}
