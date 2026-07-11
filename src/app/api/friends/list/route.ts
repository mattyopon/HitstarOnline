import { json, mapError, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  FriendRequestSummary,
  FriendSummary,
  FriendsListResponse,
} from "@/lib/friendsTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Online" = a heartbeat within this window. Kept generous (5 min) because the
// client heartbeat interval is ~60s and we don't want brief tab-switches to
// flap the dot.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  last_seen_at: string | null;
}

/**
 * GET /api/friends/list → { myCode, friends, incoming, outgoing }
 * One round-trip payload for the FriendsScreen. All reads go through the
 * service role (admin client) and are scoped by user.id in the query — the
 * caller only ever sees their own friend graph, and the sensitive profile
 * columns (friend_code / last_seen_at) are never exposed via a client query
 * pattern, only through this route's shaped response.
 */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  try {
    const admin = createAdminClient();

    const [
      { data: meRow, error: meErr },
      { data: edges, error: edgeErr },
      { data: incomingRows, error: inErr },
      { data: outgoingRows, error: outErr },
    ] = await Promise.all([
      admin.from("profiles").select("friend_code").eq("id", user.id).maybeSingle(),
      admin
        .from("friendships")
        .select("user_a, user_b")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
      admin
        .from("friend_requests")
        .select("id, from_user")
        .eq("to_user", user.id)
        .eq("status", "pending"),
      admin
        .from("friend_requests")
        .select("id, to_user")
        .eq("from_user", user.id)
        .eq("status", "pending"),
    ]);
    if (meErr) throw meErr;
    if (edgeErr) throw edgeErr;
    if (inErr) throw inErr;
    if (outErr) throw outErr;

    // Collect every counterpart id we must resolve to a profile.
    const friendIds = (edges ?? []).map((e) =>
      e.user_a === user.id ? e.user_b : e.user_a,
    );
    const incomingIds = (incomingRows ?? []).map((r) => r.from_user as string);
    const outgoingIds = (outgoingRows ?? []).map((r) => r.to_user as string);
    const allIds = Array.from(
      new Set([...friendIds, ...incomingIds, ...outgoingIds]),
    );

    const byId = new Map<string, ProfileRow>();
    if (allIds.length > 0) {
      const { data: profs, error: profErr } = await admin
        .from("profiles")
        .select("id, display_name, avatar_url, last_seen_at")
        .in("id", allIds);
      if (profErr) throw profErr;
      for (const p of (profs ?? []) as ProfileRow[]) byId.set(p.id, p);
    }

    const now = Date.now();
    const nameOf = (id: string) => byId.get(id)?.display_name || "Player";
    const avatarOf = (id: string) => byId.get(id)?.avatar_url ?? null;

    const friends: FriendSummary[] = friendIds.map((id) => {
      const seen = byId.get(id)?.last_seen_at ?? null;
      const online = seen ? now - new Date(seen).getTime() < ONLINE_WINDOW_MS : false;
      return { userId: id, displayName: nameOf(id), avatarUrl: avatarOf(id), online, lastSeenAt: seen };
    });
    // Online first, then alphabetical — a small quality-of-life ordering.
    friends.sort(
      (a, b) => Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName),
    );

    const incoming: FriendRequestSummary[] = (incomingRows ?? []).map((r) => ({
      requestId: r.id as string,
      userId: r.from_user as string,
      displayName: nameOf(r.from_user as string),
      avatarUrl: avatarOf(r.from_user as string),
    }));

    const outgoing: FriendRequestSummary[] = (outgoingRows ?? []).map((r) => ({
      requestId: r.id as string,
      userId: r.to_user as string,
      displayName: nameOf(r.to_user as string),
      avatarUrl: avatarOf(r.to_user as string),
    }));

    const payload: FriendsListResponse = {
      myCode: meRow?.friend_code ?? null,
      friends,
      incoming,
      outgoing,
    };
    return json(payload);
  } catch (e) {
    return mapError(e);
  }
}
