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
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session?.user));
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
