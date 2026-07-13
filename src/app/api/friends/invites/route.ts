import { json, mapError, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RoomInviteSummary } from "@/lib/friendsTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Invites older than this are dead (rooms are short-lived); pruned on read. */
const INVITE_TTL_MS = 15 * 60 * 1000;

/**
 * POST /api/friends/invites → { invites }
 * The caller's pending room invites, newest first, with sender names resolved.
 * Also does the housekeeping: stale rows addressed to the caller are deleted
 * here (cheap, self-scoped) instead of needing a cron.
 */
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  try {
    const admin = createAdminClient();
    const cutoff = new Date(Date.now() - INVITE_TTL_MS).toISOString();

    await admin.from("room_invites").delete().eq("to_user", user.id).lt("created_at", cutoff);

    const { data: rows, error } = await admin
      .from("room_invites")
      .select("id, from_user, room_code, created_at")
      .eq("to_user", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;

    const fromIds = [...new Set((rows ?? []).map((r) => r.from_user as string))];
    const nameOf = new Map<string, string>();
    if (fromIds.length) {
      const { data: profs, error: pErr } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", fromIds);
      if (pErr) throw pErr;
      for (const p of profs ?? []) nameOf.set(p.id as string, (p.display_name as string) || "Player");
    }

    const invites: RoomInviteSummary[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      fromUserId: r.from_user as string,
      fromName: nameOf.get(r.from_user as string) ?? "Player",
      code: r.room_code as string,
      createdAt: r.created_at as string,
    }));
    return json({ invites });
  } catch (e) {
    return mapError(e);
  }
}
