import { json, mapError, requireUser } from "@/lib/api";
import { getUserRank } from "@/lib/rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current user's ladder standing (tier/LP/record). Bronze 0 if unranked —
 *  `games === 0` is the client's "not placed yet" signal. */
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    return json({ rank: await getUserRank(user.id) });
  } catch (e) {
    return mapError(e);
  }
}
