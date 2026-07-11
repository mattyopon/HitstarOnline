"use client";

import { useCallback, useRef } from "react";
import { getSeVolume } from "@/lib/rankSound";

/** Voice trigger keys — one mp3 per trigger per character (see path below). */
export type VoiceTrigger = "waiting" | "success" | "fail" | "listening";

/**
 * Fire-and-forget character voice. Files live at
 * /public/audio/vup/<characterId>/<trigger>.mp3 — none exist yet, so EVERY
 * failure path (404, autoplay block, decode error) must silently no-op; once
 * real files are dropped in, voice "just works" with zero code changes.
 * Honors the GameRoom sound gate (`soundOn`) and the SE volume setting
 * (same convention as the rank entry fanfare in rankSound.ts).
 */
export function useCharacterVoice(
  soundOn: boolean,
): (characterId: string | null | undefined, trigger: VoiceTrigger) => void {
  // Latest gate via ref so the returned callback stays identity-stable and is
  // safe to list in effect deps (same props-in-ref pattern as YouTubePlayer).
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  return useCallback((characterId: string | null | undefined, trigger: VoiceTrigger) => {
    if (!soundOnRef.current || !characterId || typeof window === "undefined") return;
    const vol = getSeVolume();
    if (vol <= 0) return; // SE muted
    try {
      const a = new Audio(`/audio/vup/${characterId}/${trigger}.mp3`);
      a.volume = vol;
      void a.play().catch((e: unknown) => {
        // Expected until audio files ship (404) or when autoplay is blocked.
        console.debug("[voice] skip:", trigger, (e as { name?: string })?.name);
      });
    } catch {
      /* cosmetic only — never throw */
    }
  }, []);
}
