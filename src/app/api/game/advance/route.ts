import { withRoomAction } from "@/lib/api";
import { advance, GameError } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Advance a timed-out phase (placing/stealing/reveal). Any member may call it;
 * it is idempotent and server-validated against the phase deadline, so racing
 * callers and double-calls are harmless (ConflictError → {ok:true}).
 */
export const POST = withRoomAction({ conflictOk: true }, ({ user, songs, now }) => (g) => {
  if (!g.public.players.some((p) => p.userId === user.id)) {
    throw new GameError("この部屋のメンバーではありません");
  }
  return advance(g, songs, now);
});
