"use client";

import { useEffect, useState } from "react";
import { serverNow, syncServerClock } from "@/lib/serverClock";

/**
 * A clock that ticks the SERVER-corrected time (Date.now() + estimated
 * offset). Triggers a clock sync on mount, periodically, and whenever the tab
 * regains focus (backgrounded tabs throttle timers and the device clock can
 * drift). Use this for every comparison against server-authored timestamps so a
 * skewed device clock can't silence the song / mis-time the countdown.
 */
export function useServerNow(intervalMs = 500): number {
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    let active = true;
    const resync = () => {
      syncServerClock().then(() => {
        if (active) setNow(serverNow());
      });
    };
    resync();
    // Periodic re-sync keeps long sessions aligned (clocks drift, NTP steps).
    const resyncIv = setInterval(resync, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisible);

    const tick = setInterval(() => {
      if (active) setNow(serverNow());
    }, intervalMs);

    return () => {
      active = false;
      clearInterval(tick);
      clearInterval(resyncIv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return now;
}
