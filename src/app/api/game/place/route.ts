import { parseSlotIndex, sanitizeGuess, withRoomAction } from "@/lib/api";
import { placeCard } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoomAction(
  {},
  ({ user, body, songs, now }) => (g) =>
    placeCard(g, user.id, Number(body.slotIndex), sanitizeGuess(body.guess), songs, now),
  (body) => {
    const r = parseSlotIndex(body);
    return r instanceof Response ? r : null;
  },
);
