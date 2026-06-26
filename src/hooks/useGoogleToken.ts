"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * The Google provider access token from the current Supabase session, if the
 * user signed in with Google (and granted the YouTube scope). Null for guests.
 * Kept "sticky" so a Supabase token refresh (which drops provider_token) does
 * not wipe it mid-session.
 */
export function useGoogleToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session?.provider_token) {
        setToken(data.session.provider_token);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setToken(null);
        return;
      }
      if (session?.provider_token) setToken(session.provider_token);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return token;
}
