import { createClient } from "./supabase/server";

export interface SessionUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
}

/** Resolve the authenticated user (Google or anonymous) for the current request. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  const name =
    meta.full_name ||
    meta.name ||
    (user.email ? user.email.split("@")[0] : "") ||
    "プレイヤー";
  const avatarUrl = meta.avatar_url || meta.picture || null;
  // `is_anonymous` is present on anonymous sessions.
  const isAnonymous = Boolean((user as { is_anonymous?: boolean }).is_anonymous);

  return { id: user.id, name, avatarUrl, isAnonymous };
}
