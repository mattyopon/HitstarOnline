import { withRoomAction } from "@/lib/api";
import { passSteal } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoomAction({}, ({ user, songs, now }) => (g) =>
  passSteal(g, user.id, songs, now),
);
