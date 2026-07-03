"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { serverNow } from "@/lib/serverClock";

/** Re-check drift every this many ms during the listening window. */
const DRIFT_CHECK_MS = 3500;
/** Re-seek only when the player is off the expected position by more than this. */
const DRIFT_THRESHOLD_S = 1.2;

// Expected in-song position (seconds) right now. When listenStartMs is set
// (the listening window), compensate for however late this client loaded/started
// so every device converges on the same wall-clock-aligned position; otherwise
// (reveal / full-play / lobby) just use the base offset.
function expectedPos(startSeconds: number, listenStartMs?: number): number {
  const base = startSeconds || 0;
  if (!listenStartMs) return base;
  return base + Math.max(0, (serverNow() - listenStartMs) / 1000);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;
function loadYT(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
  }
  return apiPromise;
}

export function YouTubePlayer({
  videoId,
  startSeconds,
  listenStartMs,
  playing,
  reveal,
  volume,
  onUnavailable,
}: {
  videoId: string | null;
  startSeconds: number;
  /** Server epoch-ms when listening began (0/undefined = no drift-compensation,
   *  e.g. reveal/full-play or lobby). Used to seek late loaders to the correct
   *  wall-clock-aligned position so all players hear the same moment. */
  listenStartMs?: number;
  playing: boolean;
  reveal: boolean;
  volume?: number;
  /** Called when YouTube reports the video can't be embedded/played here. */
  onUnavailable?: () => void;
}) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const ready = useRef(false);
  const currentId = useRef<string | null>(null);
  const retried = useRef<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  // Close the enlarged view with Escape.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Keep latest props for the onReady callback.
  const propsRef = useRef({ videoId, startSeconds, playing, volume, onUnavailable, listenStartMs });
  propsRef.current = { videoId, startSeconds, playing, volume, onUnavailable, listenStartMs };

  function applyVolume(p: any) {
    const v = propsRef.current.volume ?? 70;
    try {
      if (v <= 0) {
        p.mute();
      } else {
        p.unMute();
        p.setVolume(Math.min(100, Math.max(0, v)));
      }
    } catch {
      /* ignore */
    }
  }

  function sync() {
    const p = playerRef.current;
    if (!p || !ready.current) return;
    const { videoId: vid, startSeconds: ss, playing: pl, listenStartMs: ls } = propsRef.current;
    if (vid && pl) {
      // Seek to the wall-clock-aligned position so a late loader catches up to
      // everyone else instead of starting behind at a fixed offset.
      const target = expectedPos(ss, ls);
      if (currentId.current !== vid) {
        currentId.current = vid;
        try {
          p.loadVideoById({ videoId: vid, startSeconds: target });
        } catch {
          /* ignore */
        }
      } else {
        // Same video already loaded: correct any accumulated drift, then play.
        try {
          if (ls) {
            const cur = p.getCurrentTime?.() ?? 0;
            if (Math.abs(cur - target) > DRIFT_THRESHOLD_S) p.seekTo(target, true);
          }
          p.playVideo();
        } catch {
          /* ignore */
        }
      }
      applyVolume(p);
    } else {
      currentId.current = null;
      try {
        p.stopVideo();
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadYT().then((YT) => {
      if (cancelled || !hostRef.current || playerRef.current) return;
      playerRef.current = new YT.Player(hostRef.current, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          fs: 0,
        },
        events: {
          onReady: () => {
            ready.current = true;
            sync();
          },
          onError: (e: any) => {
            // 5 = transient HTML5 player error → reload the same video once.
            // 100 = removed/private, 101/150 = embedding disabled by the owner:
            // unrecoverable on the client, so leave the "preparing audio" cover.
            const vid = currentId.current;
            // Only spend the one-shot retry when we actually intend to play
            // (otherwise sync() just stops the video and the budget is wasted,
            // disabling a genuine retry when the same video replays at reveal).
            if (vid && e?.data === 5 && propsRef.current.playing && !retried.current.has(vid)) {
              retried.current.add(vid);
              currentId.current = null;
              sync();
            } else if (
              vid &&
              propsRef.current.playing &&
              (e?.data === 100 || e?.data === 101 || e?.data === 150)
            ) {
              // Guard against STALE error events: sync() (line ~132) resets
              // currentId.current to null and stops the player as soon as `playing`
              // goes false (listening window ended / turn moved on) — completely
              // normal, every turn. Without this guard, a delayed onError for a
              // video we've already stopped wanting to play would still spuriously
              // flag the (possibly perfectly fine) CURRENT song as unavailable,
              // prompting an unwarranted free skip for the whole room — this was
              // the reported "songs sometimes get skipped on their own" bug.
              console.warn("[yt] video not embeddable/available:", e?.data, vid);
              propsRef.current.onUnavailable?.();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, playing, startSeconds, volume, listenStartMs]);

  // Periodic drift correction during the listening window. Handles MID-SONG drift
  // (buffer stalls) without waiting for a prop change. Re-seek only when the
  // player has drifted past the threshold so we don't audibly stutter every tick.
  useEffect(() => {
    if (!playing || !videoId || !listenStartMs) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || !ready.current || currentId.current !== videoId) return;
      try {
        const target = expectedPos(propsRef.current.startSeconds, propsRef.current.listenStartMs);
        const cur = p.getCurrentTime?.() ?? 0;
        if (Math.abs(cur - target) > DRIFT_THRESHOLD_S) p.seekTo(target, true);
      } catch {
        /* ignore */
      }
    }, DRIFT_CHECK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, videoId, listenStartMs]);

  return (
    <>
      {expanded && <div className="yt-backdrop" onClick={() => setExpanded(false)} />}
      <div className={"yt-stage" + (expanded ? " expanded" : "")}>
        <div ref={hostRef} className="yt-frame" />
        {!reveal && (
          <div className="yt-cover">
            <div className={"vinyl" + (playing && videoId ? " spinning" : "")} aria-hidden="true" />
            <div className="muted" style={{ fontWeight: 700 }}>
              {videoId ? t("♪ 再生中 — 曲名はナイショ！") : t("音源を準備中…")}
            </div>
          </div>
        )}
        <button
          type="button"
          className="yt-expand"
          onClick={() => setExpanded((e) => !e)}
          title={expanded ? t("閉じる") : t("拡大表示")}
          aria-label={expanded ? t("閉じる") : t("拡大表示")}
        >
          {expanded ? "✕" : "⛶"}
        </button>
      </div>
    </>
  );
}
