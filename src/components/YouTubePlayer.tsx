"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

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
  playing,
  reveal,
  volume,
  onUnavailable,
}: {
  videoId: string | null;
  startSeconds: number;
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
  const propsRef = useRef({ videoId, startSeconds, playing, volume, onUnavailable });
  propsRef.current = { videoId, startSeconds, playing, volume, onUnavailable };

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
    const { videoId: vid, startSeconds: ss, playing: pl } = propsRef.current;
    if (vid && pl) {
      if (currentId.current !== vid) {
        currentId.current = vid;
        try {
          p.loadVideoById({ videoId: vid, startSeconds: ss || 0 });
        } catch {
          /* ignore */
        }
      } else {
        try {
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
            } else if (e?.data === 100 || e?.data === 101 || e?.data === 150) {
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
  }, [videoId, playing, startSeconds, volume]);

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
