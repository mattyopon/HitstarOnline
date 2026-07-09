import { json, readBody, requireUser } from "@/lib/api";
import { CHAT_EVENT, MAX_CHAT_LEN, chatTopic, isEmote, type ChatMessage } from "@/lib/chat";
import { cleanText } from "@/lib/profanity";
import { loadByCode } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-user server rate limit so the relay can't be spammed (mirrors the client
// limit in chat.ts but authoritative). Fixed window keyed by userId.
const RL_WINDOW_MS = 3000;
const RL_MAX = 6;
const RL = new Map<string, { count: number; resetAt: number }>();
function rateLimited(userId: string, now: number): boolean {
  const e = RL.get(userId);
  if (!e || now >= e.resetAt) {
    RL.set(userId, { count: 1, resetAt: now + RL_WINDOW_MS });
    if (RL.size > 5000) for (const [k, v] of RL) if (now >= v.resetAt) RL.delete(k);
    return false;
  }
  if (e.count >= RL_MAX) return true;
  e.count++;
  return false;
}

let msgCounter = 0;

/**
 * Server-relayed chat send. Previously clients broadcast straight to the private
 * channel with a self-asserted `userId`, so any room member could spoof another
 * member's identity. Now the text is relayed THROUGH the server: membership is
 * verified, the text is re-masked/capped, and the sender id is stamped from the
 * authenticated session (never trusted from the body). The message is then
 * broadcast via Supabase Realtime's HTTP broadcast endpoint (service-role).
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await readBody(req);
  const code = typeof body.code === "string" ? body.code : "";
  const rawText = typeof body.text === "string" ? body.text : "";
  if (!code) return json({ error: "部屋コードがありません" }, 400);

  const text = cleanText(rawText.trim()).slice(0, MAX_CHAT_LEN);
  if (!text) return json({ error: "空メッセージです" }, 400);

  if (rateLimited(user.id, Date.now())) {
    return json({ error: "送信が早すぎます" }, 429);
  }

  // Membership check: only players in the room may post to its channel.
  const loaded = await loadByCode(code);
  if (!loaded) return json({ error: "部屋が見つかりません" }, 404);
  if (!loaded.game.public.players.some((p) => p.userId === user.id)) {
    return json({ error: "この部屋のメンバーではありません" }, 403);
  }

  const lang = typeof body.lang === "string" && body.lang ? body.lang.slice(0, 8) : "en";
  msgCounter = (msgCounter + 1) % 1_000_000;
  const msg: ChatMessage = {
    id: `${user.id.slice(0, 6)}-${Date.now()}-${msgCounter}`,
    userId: user.id, // AUTHORITATIVE — stamped from the session, never the body.
    // name/avatar are display fallbacks only; the client re-resolves them from
    // the room roster by userId, so a spoofed value here can never be shown.
    name: typeof body.name === "string" ? body.name.slice(0, 40) : "",
    avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : null,
    text,
    lang,
    emote: isEmote(text) || undefined,
    at: Date.now(),
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: "chat not configured" }, 503);

  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ topic: chatTopic(code), event: CHAT_EVENT, payload: msg, private: true }],
    }),
  });
  if (!res.ok) return json({ error: "送信に失敗しました" }, 502);

  // Echo the stamped message back so the sender can render it optimistically
  // (the broadcast uses self:false, so they won't receive their own).
  return json({ ok: true, message: msg });
}
