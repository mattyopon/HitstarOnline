// ───────────────────────────────────────────────────────────────────────────
// Shared voice-chat protocol. Pure types/constants only → importable from
// client hooks/components. Transport: a WebRTC audio mesh whose signaling rides
// on a Supabase Realtime PRIVATE channel ("voice:<ROOMCODE>"), gated by the
// same Realtime Authorization RLS as chat (migration 0003).
// ───────────────────────────────────────────────────────────────────────────

export const SIGNAL_EVENT = "sig" as const;

export function voiceTopic(code: string): string {
  return `voice:${code.toUpperCase()}`;
}

/** Whether voice chat is enabled for this deployment (build-time flag). */
export function voiceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VOICE_ENABLED === "true";
}

export interface SignalMsg {
  from: string;
  to: string;
  kind: "offer" | "answer" | "ice";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/** Presence payload tracked per participant on the voice channel. */
export interface VoicePresence {
  userId: string;
  name: string;
  /** True when the participant has muted their mic (or is listen-only). */
  muted: boolean;
}

export const DEFAULT_PEER_VOLUME = 100;
