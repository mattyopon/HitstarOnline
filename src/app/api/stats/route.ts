import { json, mapError, requireUser } from "@/lib/api";
import { getUserStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Aggregated stats / 戦績 for the signed-in user. */
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  // Stats/rank are available to everyone now (guests included); the record keys
  // on the user id, which persists for an anonymous session.
  try {
    const stats = await getUserStats(user.id);
    return json({ stats });
  } catch (e) {
    return mapError(e);
  }
}
