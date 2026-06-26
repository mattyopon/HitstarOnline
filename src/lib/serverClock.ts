"use client";

// ───────────────────────────────────────────────────────────────────────────
// Client clock synchronization.
//
// All game timing (listening window, placement deadline, early-placement bonus,
// steal countdown) is authored on the SERVER wall-clock and shipped to clients
// as absolute epoch-ms values (e.g. listenStartedAt, deadline). A client that
// compares those against its own raw Date.now() will be wrong by however much
// its device clock is skewed — and a fast clock crosses the listening deadline
// early, so playing=false and the song never plays for THAT device only. With 3+
// players the odds that ≥1 device is skewed rise, which is the reported
// "sometimes one person can't hear the song" bug.
//
// Fix: estimate offset = (serverNow - clientNow) via a few /api/time probes
// (NTP-lite, using the lowest-RTT sample and assuming symmetric latency), then
// expose serverNow() = Date.now() + offset for all timing comparisons.
// ───────────────────────────────────────────────────────────────────────────

let offset = 0; // serverNow - clientNow, in ms
let inflight: Promise<void> | null = null;

/** Best estimate of the server's current epoch-ms on this device. */
export function serverNow(): number {
  return Date.now() + offset;
}

/**
 * Probe /api/time a few times and adopt the offset from the lowest-RTT sample
 * (least asymmetric → most accurate). Coalesces concurrent calls. Never throws;
 * on total failure it keeps the previous offset (0 on first run = no correction).
 */
export async function syncServerClock(samples = 4): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    let bestRtt = Infinity;
    let bestOffset = offset;
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now();
      try {
        const res = await fetch("/api/time", { cache: "no-store" });
        if (!res.ok) continue;
        const t1 = Date.now();
        const { now } = (await res.json()) as { now: number };
        if (typeof now !== "number") continue;
        const rtt = t1 - t0;
        if (rtt < bestRtt) {
          bestRtt = rtt;
          // Server's clock at t1 ≈ now + rtt/2 (assume symmetric round-trip).
          bestOffset = now + rtt / 2 - t1;
        }
      } catch {
        /* network hiccup — try the next sample */
      }
    }
    if (bestRtt !== Infinity) {
      offset = bestOffset;
    }
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}
