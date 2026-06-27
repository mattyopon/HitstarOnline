"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat, type SendResult } from "@/hooks/useChat";
import { useUser } from "@/hooks/useUser";
import { api } from "@/lib/clientApi";
import { EMOTES, MAX_CHAT_LEN, browserLang, type ChatMessage } from "@/lib/chat";
import { useT } from "@/lib/i18n";
import type { PublicPlayer } from "@/lib/protocol";
import { Avatar } from "./Avatar";
import { RankIcon } from "./RankIcon";

interface FlyItem {
  key: string;
  msg: ChatMessage;
  text: string;
  top: number;
  dur: number;
}

/**
 * In-room chat: a Niconico-style right→left danmaku overlay plus a compact
 * chat panel with an emote bar. Messages are translated into the viewer's
 * language on the fly. Mounted for multiplayer rooms only.
 */
export function ChatDock({ code, players }: { code: string; players: PublicPlayer[] }) {
  const t = useT();
  const { user } = useUser();
  const { messages, send } = useChat(code, user, !!user);
  const myLang = browserLang();

  const [open, setOpen] = useState(false);
  const [danmaku, setDanmaku] = useState(true);
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  // msgId -> translated text (in viewer's language). Set even on failure (= original).
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [fly, setFly] = useState<FlyItem[]>([]);
  const flown = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDanmaku(localStorage.getItem("hitstar_danmaku") !== "off");
  }, []);

  // Resolve a sender's current display identity (incl. rank tier) from the roster.
  const display = useCallback(
    (m: ChatMessage) => {
      const p = players.find((pp) => pp.userId === m.userId);
      return {
        name: p?.name ?? m.name,
        avatarUrl: p?.avatarUrl ?? m.avatarUrl ?? null,
        tier: p?.tier,
      };
    },
    [players],
  );

  const shownText = useCallback(
    (m: ChatMessage) => (m.emote ? m.text : translations[m.id] ?? m.text),
    [translations],
  );

  // Translate foreign-language, non-emote messages into the viewer's language.
  useEffect(() => {
    const pending = messages.filter(
      (m) => !m.emote && m.lang !== myLang && translations[m.id] === undefined,
    );
    if (!pending.length) return;
    let cancelled = false;
    // Mark as in-flight (original as placeholder) so we don't double-request.
    setTranslations((prev) => {
      const next = { ...prev };
      for (const m of pending) if (next[m.id] === undefined) next[m.id] = m.text;
      return next;
    });
    (async () => {
      try {
        const { translations: out } = await api<{ translations: string[] }>("/api/translate", {
          texts: pending.map((m) => m.text),
          target: myLang,
        });
        if (cancelled) return;
        setTranslations((prev) => {
          const next = { ...prev };
          pending.forEach((m, i) => {
            if (typeof out[i] === "string") next[m.id] = out[i];
          });
          return next;
        });
      } catch {
        /* keep originals */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, myLang, translations]);

  // Spawn danmaku once a message's final (translated) text is available.
  useEffect(() => {
    if (!danmaku) return;
    // Prune flown ids no longer in the bounded buffer so the Set can't grow
    // unbounded over a long session (mirrors useChat's seen-Set cleanup).
    // Pending-translation messages stay in `messages`, so they're never pruned
    // before they animate.
    const present = new Set(messages.map((m) => m.id));
    for (const id of flown.current) if (!present.has(id)) flown.current.delete(id);
    const fresh: FlyItem[] = [];
    for (const m of messages) {
      if (flown.current.has(m.id)) continue;
      const needsT = !m.emote && m.lang !== myLang;
      if (needsT && translations[m.id] === undefined) continue; // wait for translation
      flown.current.add(m.id);
      laneRef.current = (laneRef.current + 1) % 7;
      fresh.push({
        key: m.id,
        msg: m,
        text: shownText(m),
        top: 6 + laneRef.current * 11 + (m.emote ? 0 : 2),
        dur: m.emote ? 7 : 9,
      });
    }
    if (fresh.length) setFly((prev) => [...prev, ...fresh]);
  }, [messages, translations, danmaku, myLang, shownText]);

  // Auto-scroll the open panel; track unread when closed.
  useEffect(() => {
    if (open) {
      setUnread(0);
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, open]);
  useEffect(() => {
    if (!open && messages.length) setUnread((u) => Math.min(99, u + 1));
    // only react to new message count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  function toggleDanmaku() {
    setDanmaku((d) => {
      const nv = !d;
      try {
        localStorage.setItem("hitstar_danmaku", nv ? "on" : "off");
      } catch {
        /* ignore */
      }
      return nv;
    });
  }

  function flash(msg: string) {
    setHint(msg);
    setTimeout(() => setHint((h) => (h === msg ? null : h)), 1600);
  }

  function feedback(r: SendResult) {
    if (r === "rate") flash(t("送信が早すぎます。少し待ってね"));
    else if (r === "offline") flash(t("接続中… 少し待ってね"));
  }

  function submit() {
    const r = send(text);
    if (r === "ok" || r === "empty") setText("");
    feedback(r);
  }

  function sendEmote(e: string) {
    feedback(send(e));
  }

  return (
    <>
      {/* Danmaku overlay */}
      {danmaku && (
        <div className="danmaku-layer" aria-hidden>
          {fly.map((f) => {
            const d = display(f.msg);
            return (
              <div
                key={f.key}
                className={"danmaku-item" + (f.msg.emote ? " emote" : "")}
                style={{ top: `${f.top}%`, animationDuration: `${f.dur}s` }}
                onAnimationEnd={() => setFly((prev) => prev.filter((x) => x.key !== f.key))}
              >
                <Avatar name={d.name || "?"} url={d.avatarUrl} className="danmaku-avatar" />
                <RankIcon tier={d.tier} size={14} />
                <span className="danmaku-name">{d.name}</span>
                <span className="danmaku-text">{f.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Chat dock */}
      <div className={"chat-dock" + (open ? " open" : "")}>
        {open ? (
          <div className="chat-card">
            <div className="row spread chat-head">
              <strong>{t("💬 チャット")}</strong>
              <div className="row" style={{ gap: 6 }}>
                <button
                  className="btn ghost tiny"
                  onClick={toggleDanmaku}
                  title={t("画面を流れるコメントの表示切替")}
                >
                  {danmaku ? t("弾幕ON") : t("弾幕OFF")}
                </button>
                <button className="btn ghost tiny" onClick={() => setOpen(false)}>
                  ✕
                </button>
              </div>
            </div>

            <div className="chat-list" ref={listRef}>
              {messages.length === 0 ? (
                <p className="tiny muted" style={{ textAlign: "center", margin: "auto" }}>
                  {t("まだメッセージはありません")}
                </p>
              ) : (
                messages.map((m) => {
                  const d = display(m);
                  const shown = shownText(m);
                  const translated = !m.emote && shown !== m.text;
                  return (
                    <div key={m.id} className="chat-msg">
                      <Avatar name={d.name || "?"} url={d.avatarUrl} className="chat-avatar" />
                      <div className="chat-body">
                        <span className="chat-name">
                          <RankIcon tier={d.tier} size={14} />
                          {d.name}
                        </span>{" "}
                        <span className={m.emote ? "chat-emote" : ""}>{shown}</span>
                        {translated && (
                          <span className="chat-orig tiny muted" title={t("原文")}>
                            🌐 {m.text}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="emote-bar">
              {EMOTES.map((e) => (
                <button key={e} className="emote-btn" onClick={() => sendEmote(e)} type="button">
                  {e}
                </button>
              ))}
            </div>

            {hint && <div className="chat-hint tiny">{hint}</div>}

            <div className="row chat-input">
              <input
                type="text"
                value={text}
                maxLength={MAX_CHAT_LEN}
                placeholder={t("メッセージを入力（自動翻訳されます）")}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button className="btn secondary" onClick={submit} type="button">
                {t("送信")}
              </button>
            </div>
          </div>
        ) : (
          <button className="chat-fab" onClick={() => setOpen(true)} aria-label={t("チャットを開く")}>
            💬
            {unread > 0 && <span className="chat-badge">{unread}</span>}
          </button>
        )}
      </div>
    </>
  );
}
