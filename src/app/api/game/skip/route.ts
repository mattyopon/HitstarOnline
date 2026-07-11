import { withRoomAction } from "@/lib/api";
import { skipSong } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoomAction({}, ({ user, songs, now }) => (g) =>
  skipSong(g, user.id, songs, now),
);
