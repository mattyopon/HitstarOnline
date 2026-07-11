import { buildVoteStartOrder, withRoomAction } from "@/lib/api";
import { advance, GameError, startFromVote } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Advance a timed-out phase (voting/placing/stealing/reveal). Any member may
 * call it; it is idempotent and server-validated against the phase deadline, so
 * racing callers and double-calls are harmless (ConflictError → {ok:true}).
 */
export const POST = withRoomAction({ conflictOk: true }, ({ user, songs, now }) => (g) => {
  if (!g.public.players.some((p) => p.userId === user.id)) {
    throw new GameError("この部屋のメンバーではありません");
  }
  // Voting deadline is the authoritative backstop: when it passes, resolve the
  // genre vote and start. startFromVote is phase-guarded + idempotent, and the
  // deck order is deterministic per state, so concurrent advance/vote callers
  // and CAS retries all converge to the same game (or a no-op).
  if (g.public.phase === "voting") {
    if ((g.public.deadline ?? Infinity) > now) return g; // not due yet → no-op
    return startFromVote(g, buildVoteStartOrder(g), songs, now);
  }
  return advance(g, songs, now);
});
