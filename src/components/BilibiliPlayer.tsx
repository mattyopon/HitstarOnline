"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

// Bilibili embedded player. Mirrors YouTubePlayer's props/contract (videoId is
// the BV id here, plus playing/reveal/volume/onUnavailable) but plays through a
// plain <iframe> — Bilibili offers no JS player API like YouTube's iframe API.
// It plays via the VIEWER'S OWN browser session (no credentials are handled).
//
// Limits of the embed (best-effort):
//  - No clean "blocked/region-locked" event. We arm a load/heartbeat TIMEOUT and
//    call onUnavailable() if the iframe never signals load within ~N seconds, so
//    the room can fall back to the SAME free-skip flow as an unplayable YouTube.
//  - Volume can't be set via API; we approximate by muting (volume 0) vs. not.
//    Mute is applied via the &muted= query param, so it only changes when the
//    iframe is (re)loaded with a new src — fine for the listen → reveal flow.

/** Seconds to wait for the iframe to load before declaring it unavailable. */
const LOAD_TIMEOUT_MS = 8000;

export function BilibiliPlayer({
  videoId,
  playing,
  reveal,
  volume,
  onUnavailable,
}: {
  /** Bilibili BV id (named videoId to mirror YouTubePlayer's contract). */
  videoId: string | null;
  playing: boolean;
  reveal: boolean;
  volume?: number;
  /** Called when the embed never appears to start (region/login/blocked). */
  onUnavailable?: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  // Close the enlarged view with Escape.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Should the embed be mounted/playing right now? (playing while listening, or
  // any time during reveal so the full clip is available).
  const active = !!videoId && (playing || reveal);
  const muted = (volume ?? 70) <= 0;

  // Build the embed src. autoplay + danmaku off + high quality; muted reflects
  // the volume slider's "is it audible at all" state.
  const src =
    videoId && active
      ? `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(videoId)}` +
        `&autoplay=1&danmaku=0&high_quality=1&muted=${muted ? 1 : 0}`
      : null;

  // Reset the loaded flag whenever the src changes (new card / play state).
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  // Best-effort unavailable detection: if the iframe never fires onLoad within
  // LOAD_TIMEOUT_MS while it's supposed to be active, treat it as unplayable and
  // reuse the room's free-skip flow.
  useEffect(() => {
    if (!src || loaded) return;
    const id = window.setTimeout(() => {
      if (!loaded) onUnavailableRef.current?.();
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [src, loaded]);

  return (
    <>
      {expanded && <div className="yt-backdrop" onClick={() => setExpanded(false)} />}
      <div className={"yt-stage" + (expanded ? " expanded" : "")}>
        <div className="yt-frame">
          {src && (
            <iframe
              key={src}
              src={src}
              title="bilibili"
              width="100%"
              height="100%"
              style={{ border: 0, width: "100%", height: "100%" }}
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
              scrolling="no"
              onLoad={() => setLoaded(true)}
            />
          )}
        </div>
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
