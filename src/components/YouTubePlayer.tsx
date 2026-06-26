"use client";

import { useEffect, useRef } from "react";

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
}: {
  videoId: string | null;
  startSeconds: number;
  playing: boolean;
  reveal: boolean;
  volume?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const ready = useRef(false);
  const currentId = useRef<string | null>(null);

  // Keep latest props for the onReady callback.
  const propsRef = useRef({ videoId, startSeconds, playing, volume });
  propsRef.current = { videoId, startSeconds, playing, volume };

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
    <div className="yt-stage">
      <div ref={hostRef} className="yt-frame" />
      {!reveal && (
        <div className="yt-cover">
          <div className={"vinyl" + (playing && videoId ? " spinning" : "")} />
          <div className="muted" style={{ fontWeight: 700 }}>
            {videoId ? "♪ 再生中 — 曲名はナイショ！" : "音源を準備中…"}
          </div>
        </div>
      )}
    </div>
  );
}
