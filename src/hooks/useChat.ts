"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CHAT_BUFFER,
  CHAT_EVENT,
  MAX_CHAT_LEN,
  RATE_MAX,
  RATE_WINDOW_MS,
  browserLang,
  chatTopic,
  isEmote,
  type ChatMessage,
} from "@/lib/chat";
import { cleanText } from "@/lib/profanity";
import { api } from "@/lib/clientApi";
import type { ClientUser } from "@/hooks/useUser";

export type SendResult = "ok" | "empty" | "rate" | "offline";

interface UseChat {
  messages: ChatMessage[];
  ready: boolean;
  /** Send free text (auto profanity-masked, length-capped). */
  send: (text: string) => SendResult;
}

let counter = 0;
function newId(userId: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${userId.slice(0, 6)}-${counter}-${performance.now().toFixed(0)}`;
}

/**
 * Subscribes to a room's PRIVATE chat broadcast channel ("chat:<CODE>") and
 * exposes a rate-limited send(). Membership is enforced server-side by the
 * Realtime Authorization policies (migration 0003); we additionally set the
 * auth token so the private channel can authorize. Messages are kept in a small
 * ring buffer and de-duplicated by id.
 */
export function useChat(code: string, me: ClientUser | null, enabled: boolean): UseChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);
  const sentTimes = useRef<number[]>([]);
  const seen = useRef<Set<string>>(new Set());

  const push = useCallback((m: ChatMessage) => {
    if (seen.current.has(m.id)) return;
    seen.current.add(m.id);
    setMessages((prev) => {
      const next = [...prev, m];
      if (next.length > CHAT_BUFFER) {
        const dropped = next.splice(0, next.length - CHAT_BUFFER);
        for (const d of dropped) seen.current.delete(d.id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled || !me) return;
    const supabase = createClient();
    let active = true;
    setReady(false);

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      // Required for PRIVATE channel RLS to see the user's JWT.
      try {
        await supabase.realtime.setAuth(session?.access_token ?? null);
      } catch {
        /* ignore — public fallback won't authorize, handled by ready=false */
      }

      const channel = supabase.channel(chatTopic(code), {
        config: { broadcast: { self: false }, private: true },
      });
      channelRef.current = channel;

      channel.on("broadcast", { event: CHAT_EVENT }, (payload) => {
        const m = (payload as { payload?: unknown }).payload as ChatMessage | undefined;
        if (!m || typeof m.id !== "string" || typeof m.text !== "string") return;
        // Defense in depth: re-mask on receive in case a peer sent raw text.
        push({ ...m, text: cleanText(m.text).slice(0, MAX_CHAT_LEN) });
      });

      channel.subscribe((status) => {
        if (!active) return;
        setReady(status === "SUBSCRIBED");
      });
    })();

    return () => {
      active = false;
      setReady(false);
      const ch = channelRef.current;
      channelRef.current = null;
      seen.current.clear();
      if (ch) supabase.removeChannel(ch);
    };
  }, [code, enabled, me, push]);

  const send = useCallback(
    (raw: string): SendResult => {
      if (!channelRef.current || !me) return "offline";

      const emote = isEmote(raw);
      const text = cleanText(raw.trim()).slice(0, MAX_CHAT_LEN);
      if (!text) return "empty";

      // Client rate limit (fast local gate; the server enforces its own too).
      const now = performance.now();
      sentTimes.current = sentTimes.current.filter((t) => now - t < RATE_WINDOW_MS);
      if (sentTimes.current.length >= RATE_MAX) return "rate";
      sentTimes.current.push(now);

      const lang = browserLang();
      // Optimistic local echo (the server broadcast uses self:false, so we never
      // receive our own message back). The relayed copy others receive is stamped
      // with a server-authoritative userId, so nobody can spoof someone else's id.
      const msg: ChatMessage = {
        id: newId(me.id),
        userId: me.id,
        name: me.name,
        avatarUrl: me.avatarUrl,
        text,
        lang,
        emote: emote || undefined,
        at: Date.now(),
      };
      push(msg);

      // Relay THROUGH the server (which stamps the sender id from the session and
      // re-masks/caps the text) instead of broadcasting the raw payload directly.
      void api("/api/chat/send", {
        code,
        text: raw.trim(),
        name: me.name,
        avatarUrl: me.avatarUrl,
        lang,
      }).catch(() => {
        /* fire-and-forget: the optimistic echo already showed it locally */
      });
      return "ok";
    },
    [code, me, push],
  );

  return { messages, ready, send };
}
