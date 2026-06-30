import { buildVoteStartOrder, withRoomAction } from "@/lib/api";
import { allVoted, castVote, GameError, startFromVote } from "@/lib/engine";
import { CATEGORY_IDS } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cast (or change) the caller's genre vote during the "voting" phase. Any
 * connected member may vote. When the last eligible voter votes, the game starts
 * atomically in the SAME transition (the deck order is deterministic per state,
 * and startFromVote is phase-guarded/idempotent → safe under CAS and the racing
 * deadline-advance path). The deadline remains the authoritative backstop.
 */
export const POST = withRoomAction({}, ({ user, body, songs, now }) => (g) => {
  if (!g.public.players.some((p) => p.userId === user.id)) {
    throw new GameError("この部屋のメンバーではありません");
  }
  const raw = Array.isArray(body.categories) ? body.categories : [];
  const cats = raw.filter((c): c is string => typeof c === "string" && CATEGORY_IDS.has(c));

  const voted = castVote(g, user.id, cats, now);
  // Early-start optimization (atomic with this vote): if everyone has now voted,
  // resolve the winner and deal immediately instead of waiting for the deadline.
  if (allVoted(voted.public)) {
    return startFromVote(voted, buildVoteStartOrder(voted), songs, now);
  }
  return voted;
});
