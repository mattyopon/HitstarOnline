import { withRoomAction } from "@/lib/api";
import { advanceReveal, GameError } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Skip the reveal ("▶ 次の曲へ"). The reveal plays the song in full, so any
 * member may advance to the next turn when everyone's ready. Idempotent and
 * server-validated (no-op unless the room is in the reveal phase).
 */
export const POST = withRoomAction({ conflictOk: true }, ({ user, songs, now }) => (g) => {
  if (!g.public.players.some((p) => p.userId === user.id)) {
    throw new GameError("この部屋のメンバーではありません");
  }
  return advanceReveal(g, songs, now);
});
