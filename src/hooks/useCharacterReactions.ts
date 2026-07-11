"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicState } from "@/lib/protocol";
import { charLines } from "@/lib/gachaChars";
import { serverNow } from "@/lib/serverClock";
import type { VoiceTrigger } from "./useCharacterVoice";

/** One speech bubble shown next to a player's row (their leader "speaking"). */
export interface ReactionBubble {
  /** Monotonic instance id — remounts the bubble so the pop replays. */
  id: number;
  trigger: "waiting" | "success" | "fail";
  text: string;
}

/** How long a bubble stays up before auto-dismissing. */
const BUBBLE_MS = 3500;
/** "Still deciding" nudge: fires this long after the listening window ends
 *  with no placement submitted (client-side timer on public state only). */
const WAITING_NUDGE_MS = 10_000;

/**
 * Derives character reaction bubbles (userId → bubble) for EVERY player's
 * equipped leader from EXISTING public state — no engine/server changes:
 *  - success/fail: from `reveal.activeCorrect` / `reveal.steals[].correct`
 *    when a new round's reveal lands.
 *  - waiting: a local timer off `listeningEndedAt` while the active player
 *    hasn't placed (placement flips phase to "stealing", so "still placing
 *    after listening ended" ⇔ undecided).
 *  - listening (voice plumbing only, no bubble): on a new mystery card.
 * Bots and players without a published leaderCharacterId never react (the
 * bubble IS the leader speaking). `play` is the useCharacterVoice callback.
 */
export function useCharacterReactions(
  state: PublicState | null,
  play: (characterId: string | null | undefined, trigger: VoiceTrigger) => void,
): Record<string, ReactionBubble> {
  const [bubbles, setBubbles] = useState<Record<string, ReactionBubble>>({});
  const idRef = useRef(0);
  const dismissTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // Fire-once guards, keyed by round (same pattern as GameRoom's autoPassedRound).
  const lastRevealRound = useRef<number | null>(null);
  const lastWaitingRound = useRef<number | null>(null);
  const lastListenCard = useRef<string | null>(null);
  // Latest state/play via refs so timers re-check without re-binding effects.
  const stateRef = useRef(state);
  stateRef.current = state;
  const playRef = useRef(play);
  playRef.current = play;

  const emit = useCallback(
    (userId: string, trigger: "waiting" | "success" | "fail", text: string) => {
      const id = ++idRef.current;
      setBubbles((prev) => ({ ...prev, [userId]: { id, trigger, text } }));
      const timer = setTimeout(() => {
        dismissTimers.current.delete(id);
        // Only dismiss if OUR bubble is still the one showing for this player.
        setBubbles((prev) => {
          if (prev[userId]?.id !== id) return prev;
          const { [userId]: _gone, ...rest } = prev;
          return rest;
        });
      }, BUBBLE_MS);
      dismissTimers.current.set(id, timer);
    },
    [],
  );

  // Clear all pending dismiss timers on unmount.
  useEffect(() => {
    const timers = dismissTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  // ── success / fail: react once per round when the reveal lands ─────────────
  const revealPresent = !!state?.reveal;
  const round = state?.round;
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !s.reveal) return;
    if (s.phase !== "reveal" && s.phase !== "gameover") return;
    if (lastRevealRound.current === s.round) return;
    lastRevealRound.current = s.round;
    const byId = new Map(s.players.map((p) => [p.userId, p]));
    const reactFor = (userId: string, correct: boolean) => {
      const p = byId.get(userId);
      if (!p || p.isBot || !p.leaderCharacterId) return;
      const trigger = correct ? "success" : "fail";
      emit(userId, trigger, charLines(p.leaderCharacterId)[trigger]);
      playRef.current(p.leaderCharacterId, trigger);
    };
    // Active player: only when they actually placed (or bought) — a timed-out
    // non-placement gets no reaction.
    if (s.reveal.placementSlot != null || s.reveal.bought) {
      reactFor(s.order[s.activeIndex], s.reveal.activeCorrect);
    }
    // Stealers: same "placement revealed correct/incorrect" semantic.
    for (const st of s.reveal.steals) reactFor(st.userId, st.correct);
  }, [revealPresent, round, emit]);

  // ── waiting: nudge the (human) active player who stalls after listening ────
  const version = state?.version;
  useEffect(() => {
    const s = stateRef.current;
    if (!s || s.phase !== "placing" || s.listeningEndedAt == null) return;
    if (lastWaitingRound.current === s.round) return;
    const activeId = s.order[s.activeIndex];
    const active = s.players.find((p) => p.userId === activeId);
    if (!active || active.isBot || !active.leaderCharacterId) return;
    const leaderId = active.leaderCharacterId;
    const startedRound = s.round;
    const delay = Math.max(0, s.listeningEndedAt + WAITING_NUDGE_MS - serverNow());
    const timer = setTimeout(() => {
      // Re-check against the LATEST state: a placement/skip cancels the nudge
      // via cleanup, but guard anyway (refs are cheap insurance).
      const cur = stateRef.current;
      if (!cur || cur.phase !== "placing" || cur.round !== startedRound) return;
      if (cur.order[cur.activeIndex] !== activeId) return;
      if (lastWaitingRound.current === startedRound) return;
      lastWaitingRound.current = startedRound;
      emit(activeId, "waiting", charLines(leaderId).waiting);
      playRef.current(leaderId, "waiting");
    }, delay);
    return () => clearTimeout(timer);
  }, [version, emit]);

  // ── listening: voice plumbing only (no bubble), once per mystery card ──────
  const cardId = state?.current?.cardId;
  useEffect(() => {
    const s = stateRef.current;
    if (!s || s.phase !== "placing" || !s.current?.cardId) return;
    if (lastListenCard.current === s.current.cardId) return;
    lastListenCard.current = s.current.cardId;
    const active = s.players.find((p) => p.userId === s.order[s.activeIndex]);
    if (active && !active.isBot && active.leaderCharacterId) {
      playRef.current(active.leaderCharacterId, "listening");
    }
  }, [cardId]);

  return bubbles;
}
