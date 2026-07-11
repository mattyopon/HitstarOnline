// Shared TS types for the friends layer. Safe to import from both server (API
// routes) and client (FriendsScreen / useFriends) code — pure shape defs only,
// no Supabase access here (mirrors gachaTypes.ts).

/** An accepted friend, as rendered in the friends list. */
export interface FriendSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** last_seen_at within the presence window (5 min). */
  online: boolean;
  lastSeenAt: string | null;
}

/** A pending friend request (incoming or outgoing), with the counterpart. */
export interface FriendRequestSummary {
  requestId: string;
  /** The OTHER party's user id (sender for incoming, recipient for outgoing). */
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

/** GET /api/friends/list response payload. */
export interface FriendsListResponse {
  /** The caller's own shareable friend code (e.g. "HS-8FKQ2Z"). */
  myCode: string | null;
  friends: FriendSummary[];
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
}
