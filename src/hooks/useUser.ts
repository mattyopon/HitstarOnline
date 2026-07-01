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
      if (data.user) seedGachaPlayer(supabase);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session?.user));
      setLoading(false);
      if (session?.user) seedGachaPlayer(supabase);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
