import { withRoomAction } from "@/lib/api";
import { extendListening } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No deck needed: extending the listening window is pure timing.
export const POST = withRoomAction({ deck: false }, ({ user, now }) => (g) =>
  extendListening(g, user.id, now),
);
