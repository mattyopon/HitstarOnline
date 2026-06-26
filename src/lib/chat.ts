// ───────────────────────────────────────────────────────────────────────────
// Shared chat protocol & helpers. Pure types/constants only → importable from
// client components and hooks. The actual transport is Supabase Realtime
// Broadcast over a PRIVATE channel ("chat:<ROOMCODE>"), gated by the RLS
// policies in migration 0003.
// ───────────────────────────────────────────────────────────────────────────

export const CHAT_EVENT = "msg" as const;

/** Channel/topic name for a room's chat (must match the RLS topic convention). */
export function chatTopic(code: string): string {
  return `chat:${code.toUpperCase()}`;
}

/** Fixed emote allow-list (rendered larger; safe, no arbitrary markup). */
export const EMOTES = ["👍", "😂", "🎉", "🔥", "😮", "😭", "❤️", "🤔", "👏", "🎵"] as const;
export type Emote = (typeof EMOTES)[number];

const EMOTE_SET = new Set<string>(EMOTES);
export function isEmote(text: string): boolean {
  return EMOTE_SET.has(text.trim());
}

export const MAX_CHAT_LEN = 200;
/** Client rate limit: at most N messages per window (ms). */
export const RATE_MAX = 5;
export const RATE_WINDOW_MS = 3000;
/** Keep at most this many messages in the in-memory log. */
export const CHAT_BUFFER = 60;

/** A chat message as it travels over the wire and is rendered. */
export interface ChatMessage {
  /** Client-generated unique id (also used for de-dupe). */
  id: string;
  /** Sender's auth user id (validated against the room's player list on receive). */
  userId: string;
  /** Sender's display name at send time (re-resolved from players on render). */
  name: string;
  avatarUrl?: string | null;
  /** Already profanity-masked, length-capped text. */
  text: string;
  /** BCP-47-ish primary language subtag the sender was using (e.g. "ja", "en"). */
  lang: string;
  /** Single-emoji message (rendered large, flies bigger). */
  emote?: boolean;
  /** Epoch ms (sender clock). */
  at: number;
}

/** Primary language subtag of the current browser (e.g. "ja", "en"). */
export function browserLang(): string {
  if (typeof navigator === "undefined") return "en";
  const l = navigator.language || "en";
  return l.toLowerCase().split("-")[0];
}
