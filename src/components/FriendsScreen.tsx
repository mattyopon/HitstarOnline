"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useFriends } from "@/hooks/useFriends";
import { api } from "@/lib/clientApi";
import { Avatar } from "./Avatar";

/**
 * Friends screen (bottom-nav "仲間"/Friends tab).
 *
 * Real friends backend (migration 0007 + /api/friends/*): the caller's own
 * shareable friend code, an add-by-code input, incoming/outgoing pending
 * requests, and the accepted-friends list with a binary online dot, an
 * "invite to my current room" (clipboard, reuses the existing join-by-code
 * flow) affordance, and remove. Plus the original working join-by-room-code
 * panel (verbatim). All strings via t(); empty/error states handled.
 *
 * A friend's avatar is their profiles.avatar_url (Google) or a name-letter
 * chip fallback (guest). We intentionally do NOT render another player's
 * equipped-muse portrait: that would require reading their player_party, which
 * isn't exposed (RLS SELECT-own) and is out of scope. Only the local user sees
 * their own muse (feature B, on the Lobby player card).
 */
export function FriendsScreen({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const router = useRouter();
  const { data, loading, error, refresh } = useFriends();

  const [code, setCode] = useState(""); // join-by-room-code
  const [addCode, setAddCode] = useState(""); // add-friend-by-friend-code
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const onlineCount = data.friends.filter((f) => f.online).length;

  // Reuses the Lobby's "join by room code" flow verbatim: navigate to
  // /room/<CODE> and let the existing room join/create logic take over.
  function join() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    router.push(`/room/${c}`);
  }

  async function sendRequest() {
    const c = addCode.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ ok: boolean; autoAccepted?: boolean }>("/api/friends/request", { code: c });
      setAddCode("");
      setMsg({ kind: "ok", text: res.autoAccepted ? t("フレンドになりました！") : t("フレンド申請を送りました") });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : t("送信に失敗しました") });
    } finally {
      setBusy(false);
    }
  }

  async function respond(requestId: string, accept: boolean) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/friends/respond", { requestId, accept });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : t("送信に失敗しました") });
    } finally {
      setBusy(false);
    }
  }

  async function remove(friendId: string) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/friends/remove", { friendId });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : t("送信に失敗しました") });
    } finally {
      setBusy(false);
    }
  }

  function copyMyCode() {
    if (!data.myCode) return;
    navigator.clipboard?.writeText(data.myCode);
    setMsg({ kind: "ok", text: t("フレンドコードをコピーしました") });
  }

  // "Invite to my current room": deliver an in-app ping (room_invites) the
  // friend sees as a Lobby banner — the old behavior only copied the code to
  // the clipboard, so the friend had to receive it out-of-band (detected gap).
  async function invite(friendId: string) {
    if (busy) return;
    let room: string | null = null;
    try {
      room = localStorage.getItem("hitstar_last_room");
    } catch {
      /* ignore */
    }
    if (!room) {
      setMsg({ kind: "err", text: t("先に部屋を作ってから招待してください") });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/friends/invite", { friendId, code: room });
      navigator.clipboard?.writeText(room).catch?.(() => {});
      setMsg({ kind: "ok", text: t("招待を送りました！（部屋 {code}）", { code: room }) });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : t("送信に失敗しました") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen-roster-inner">
      <div className="roster-hero">
        <div>
          <h1 className="ttl">
            {t("フレンド")}
            <small>{t("{n}人がオンライン", { n: onlineCount })}</small>
          </h1>
        </div>
        {onClose && (
          <button type="button" className="btn outline sm" style={{ marginLeft: "auto" }} onClick={onClose}>
            {t("閉じる")}
          </button>
        )}
      </div>

      {msg && (
        <div className={msg.kind === "err" ? "error" : "notice tiny"} style={{ marginBottom: 12 }}>
          {msg.text}
        </div>
      )}

      <div className="friends-layout">
        <div className="panel">
          {/* My friend code (identity affordance). */}
          <h3>
            {t("マイフレンドコード")}
            <small>{t("共有して友達を追加")}</small>
          </h3>
          <div className="friend-code-card">
            <span className="friend-code-value serif">
              {data.myCode ?? (loading ? t("読み込み中…") : "—")}
            </span>
            <button
              type="button"
              className="btn sm outline"
              onClick={copyMyCode}
              disabled={!data.myCode}
            >
              {t("コピー")}
            </button>
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            {t("このコードを友達に伝えると、フレンドとして追加してもらえます。")}
          </p>
          {error && (
            <p className="tiny muted" style={{ marginTop: 8 }}>
              {t("フレンド情報を読み込めませんでした。")}
            </p>
          )}

          {/* Add a friend by code. */}
          <div className="divider">{t("フレンドを追加")}</div>
          <div className="row">
            <input
              type="text"
              value={addCode}
              placeholder={t("フレンドコード（例: HS-ABCDEF）")}
              maxLength={16}
              className="serif"
              aria-label={t("フレンドコード（例: HS-ABCDEF）")}
              style={{ textTransform: "uppercase", fontWeight: 700 }}
              onChange={(e) => setAddCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendRequest()}
            />
            <button type="button" className="btn outline" onClick={sendRequest} disabled={busy || !addCode.trim()}>
              {t("追加")}
            </button>
          </div>

          {/* Incoming requests. */}
          {data.incoming.length > 0 && (
            <>
              <div className="divider">{t("届いた申請")}</div>
              <div className="friend-list friends-screen-list">
                {data.incoming.map((r) => (
                  <div key={r.requestId} className="friend friends-screen-row">
                    <Avatar name={r.displayName} url={r.avatarUrl} size="md" />
                    <span className="nm">{r.displayName}</span>
                    <span className="friend-actions">
                      <button type="button" className="btn sm" onClick={() => respond(r.requestId, true)} disabled={busy}>
                        {t("承認")}
                      </button>
                      <button type="button" className="btn sm outline" onClick={() => respond(r.requestId, false)} disabled={busy}>
                        {t("拒否")}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Friends list. */}
          <div className="divider">{t("フレンドリスト")}</div>
          {data.friends.length === 0 ? (
            <p className="tiny muted" style={{ marginTop: 8 }}>
              {loading ? t("読み込み中…") : t("まだフレンドがいません。コードを共有して追加しよう！")}
            </p>
          ) : (
            <div className="friend-list friends-screen-list">
              {data.friends.map((f) => (
                <div key={f.userId} className={"friend friends-screen-row" + (f.online ? "" : " off")}>
                  <Avatar name={f.displayName} url={f.avatarUrl} size="md" />
                  <span className="nm">{f.displayName}</span>
                  <span className={"st" + (f.online ? "" : " off")}>
                    {f.online ? "● " : "○ "}
                    {f.online ? t("オンライン") : t("オフライン")}
                  </span>
                  <span className="friend-actions">
                    <button type="button" className="btn sm outline" onClick={() => invite(f.userId)} disabled={busy}>
                      {t("招待")}
                    </button>
                    <button type="button" className="btn sm outline" onClick={() => remove(f.userId)} disabled={busy}>
                      {t("削除")}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Outgoing pending requests (display-only). */}
          {data.outgoing.length > 0 && (
            <>
              <div className="divider">{t("送った申請")}</div>
              <div className="friend-list friends-screen-list">
                {data.outgoing.map((r) => (
                  <div key={r.requestId} className="friend friends-screen-row off">
                    <Avatar name={r.displayName} url={r.avatarUrl} size="md" />
                    <span className="nm">{r.displayName}</span>
                    <span className="st off">{t("保留中")}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <h3>
            {t("友達の部屋に入る")}
            <small>{t("部屋コードで招待")}</small>
          </h3>

          <p className="tiny muted" style={{ marginTop: 8 }}>
            {t("フレンドから届いた部屋コードを入力して、いっしょに遊ぼう！")}
          </p>

          <div className="row" style={{ marginTop: 12 }}>
            <input
              type="text"
              value={code}
              placeholder={t("部屋コード（例: AB23）")}
              maxLength={6}
              className="serif"
              aria-label={t("部屋コード（例: AB23）")}
              style={{
                textTransform: "uppercase",
                letterSpacing: 6,
                textAlign: "center",
                fontStyle: "italic",
                fontWeight: 700,
              }}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <button type="button" className="btn outline" onClick={join} disabled={!code.trim()}>
              {t("参加")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
