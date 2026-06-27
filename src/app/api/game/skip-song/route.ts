import { withRoomAction } from "@/lib/api";
import { GameError, systemSkip } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Free "skip this song" — allowed ONLY in solo/NPC rooms (a bot is present), so
 * it can't be abused competitively. Lets the human move past a long or unplayable
 * track even on a bot's turn. cardId-guarded so concurrent calls don't over-skip.
 */
export const POST = withRoomAction({ conflictOk: true }, ({ user, body, songs, now }) => (g) => {
  const me = g.public.players.find((p) => p.userId === user.id);
  if (!me) throw new GameError("この部屋のメンバーではありません");
  if (!g.public.players.some((p) => p.isBot)) {
    throw new GameError("この部屋ではスキップできません");
  }
  if (g.public.phase !== "placing") return g;
  // Only skip the card the client is actually looking at (idempotent vs races).
  if (typeof body.cardId === "string" && g.public.current?.cardId !== body.cardId) return g;
  return systemSkip(g, songs, now);
});
