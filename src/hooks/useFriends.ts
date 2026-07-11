"use client";

import { useCallback, useEffect, useState } from "react";
import type { FriendsListResponse } from "@/lib/friendsTypes";

const EMPTY: FriendsListResponse = { myCode: null, friends: [], incoming: [], outgoing: [] };

/**
 * Fetch of the caller's friend graph (GET /api/friends/list). Same idiom as
 * Lobby's useGachaSummary: loading/error tolerant (falls back to the empty
 * state rather than crashing the screen — expected before migration 0007 is
 * applied), and a `refresh()` that bumps an internal key to re-fetch after any
 * mutation (request / accept / decline / remove).
 */
export function useFriends() {
  const [data, setData] = useState<FriendsListResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [key, setKey] = useState(0);

  const refresh = useCallback(() => setKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    fetch("/api/friends/list")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as FriendsListResponse;
      })
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active) {
          setError(true);
          setData(EMPTY);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key]);

  return { data, loading, error, refresh };
}
