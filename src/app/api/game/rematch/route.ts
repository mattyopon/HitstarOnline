import { withRoomAction } from "@/lib/api";
import { rematchToLobby } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rematch: host returns the finished room to the lobby with the same members
 * and settings. Everyone else is pulled back automatically via the Realtime
 * state update; the normal start flow (vote / direct) then applies.
 */
export const POST = withRoomAction({ deck: false }, ({ user }) => (g) =>
  rematchToLobby(g, user.id),
);
