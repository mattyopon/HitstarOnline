"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PublicState } from "@/lib/protocol";

/**
 * Subscribes to a room's sanitized state via Supabase Realtime. Does an initial
 * fetch (RLS requires membership, so call this only after joining) and then
 * applies every postgres_changes update. Stale updates (older version) are
 * ignored so a slow initial fetch can't clobber a newer realtime payload.
 */
export function useRoom(code: string, enabled: boolean) {
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastVersion = useRef(-1);

  // Version-guarded state application, shared by the initial fetch, the Realtime
  // subscription, AND optimistic updates from the acting client (apply()).
  // Returning it lets the player who just acted reflect their move immediately
  // instead of waiting for the Realtime round-trip.
  const apply = useCallback((next: unknown) => {
    const s = next as PublicState | null | undefined;
    if (!s || typeof s.version !== "number") return;
    if (s.version <= lastVersion.current) return; // ignore stale
    lastVersion.current = s.version;
    setError(null);
    setState(s);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let active = true;
    lastVersion.current = -1;

    const refetch = async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("state")
        .eq("code", code)
        .maybeSingle();
      if (!active) return;
      if (error) {
        // Don't surface transient fetch errors if we already have state.
        if (lastVersion.current < 0) setError("部屋の取得に失敗しました");
        return;
      }
      apply(data?.state);
    };

    refetch();

    const channel = supabase
      .channel(`room-${code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload) => apply((payload.new as any)?.state),
      )
      .subscribe((status) => {
        // On (re)subscribe — including after the client auto-reconnects a dropped
        // socket — refetch to catch up on any updates missed while it was down.
        if (status === "SUBSCRIBED") refetch();
      });

    // Coming back from a backgrounded tab or a network drop: resync immediately
    // (Realtime may have missed messages during the gap).
    const onWake = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      supabase.removeChannel(channel);
    };
  }, [code, enabled, apply]);

  return { state, error, apply };
}
