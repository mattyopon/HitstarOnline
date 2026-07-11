import { withRoomAction } from "@/lib/api";
import { buyCard } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoomAction({}, ({ user, songs, now }) => (g) =>
  buyCard(g, user.id, songs, now),
);
