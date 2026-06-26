import { json, mapError, requireUser } from "@/lib/api";
import { getUserStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Aggregated stats / 戦績 for the signed-in user. */
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  // Guests have no persistent record.
  if (user.isAnonymous) return json({ stats: null, guest: true });
  try {
    const stats = await getUserStats(user.id);
    return json({ stats });
  } catch (e) {
    return mapError(e);
  }
}
