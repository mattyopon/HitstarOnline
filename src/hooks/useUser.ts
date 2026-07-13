"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ClientUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toUser(u: any): ClientUser | null {
  if (!u) return null;
  const meta = u.user_metadata || {};
  const name =
    meta.full_name ||
    meta.name ||
    (u.email ? String(u.email).split("@")[0] : "") ||
    "ゲスト";
  return {
    id: u.id,
    name,
    avatarUrl: meta.avatar_url || meta.picture || null,
    isAnonymous: !!u.is_anonymous,
  };
}

// Bootstrap the gacha layer's per-player rows (starter gems/characters/party)
// via the SECURITY DEFINER seed_new_player() RPC (0006_gacha.sql). Every
// insert inside it is ON CONFLICT DO NOTHING, so calling this on EVERY auth
// resolution (fresh sign-in, page-load session restore, token refresh) is
// intentionally safe/idempotent — returning players just no-op. Best-effort:
// a failure here must never block the auth flow itself.
function seedGachaPlayer(supabase: ReturnType<typeof createClient>) {
  supabase.rpc("seed_new_player").then(({ error }) => {
    if (error) console.error("[useUser] seed_new_player failed:", error.message);
  });
}

// profiles is created by the handle_new_user trigger, which only fires on
// INSERT — so a guest who LINKS a Google identity (same user id, no new
// auth.users row) keeps the stale guest display_name/avatar in profiles,
// which is what friends see. Sync it from the Google metadata once per page
// load (update-own RLS policy, 0001). Best-effort and idempotent.
let profileSynced = false;
function syncProfileFromIdentity(supabase: ReturnType<typeof createClient>, u: any) {
  if (profileSynced || !u || u.is_anonymous) return;
  const meta = u.user_metadata || {};
  const display = meta.full_name || meta.name;
  const avatar = meta.avatar_url || meta.picture;
  if (!display && !avatar) return;
  profileSynced = true;
  supabase
    .from("profiles")
    .update({
      ...(display ? { display_name: display } : {}),
      ...(avatar ? { avatar_url: avatar } : {}),
    })
    .eq("id", u.id)
    .then(({ error }) => {
      if (error) console.warn("[useUser] profile sync failed:", error.message);
    });
}

export function useUser() {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(toUser(data.user));
      setLoading(false);
      if (data.user) {
        seedGachaPlayer(supabase);
        syncProfileFromIdentity(supabase, data.user);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session?.user));
      setLoading(false);
      if (session?.user) {
        seedGachaPlayer(supabase);
        syncProfileFromIdentity(supabase, session.user);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
