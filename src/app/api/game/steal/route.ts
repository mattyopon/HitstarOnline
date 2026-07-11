import { parseSlotIndex, withRoomAction } from "@/lib/api";
import { stealCard } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoomAction(
  {},
  ({ user, body, songs, now }) => (g) => stealCard(g, user.id, Number(body.slotIndex), songs, now),
  (body) => {
    const r = parseSlotIndex(body);
    return r instanceof Response ? r : null;
  },
);
