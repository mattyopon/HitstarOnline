"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PublicState } from "@/lib/protocol";

/**
 * Subscribes to a room's sanitized state via Supabase Realtime. Does an initial
 * fetch (RLS requires membership, so call this only after joining) and then
 * applies every postgres_changes update to the rooms row.
 */
export function useRoom(code: string, enabled: boolean) {
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let active = true;

    const refetch = async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("state")
        .eq("code", code)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setError("部屋の取得に失敗しました");
        return;
      }
      if (data?.state) setState(data.state as PublicState);
    };

    refetch();

    const channel = supabase
      .channel(`room-${code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const next = (payload.new as any)?.state;
          if (next) setState(next as PublicState);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [code, enabled]);

  return { state, error };
}
