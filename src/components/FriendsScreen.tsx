"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { GACHA_CHARS } from "@/lib/gachaChars";

/**
 * Friends screen (bottom-nav "仲間"/Friends tab, mock `.friend-list`).
 *
 * There is intentionally NO real friends backend in this app yet — so this is a
 * BILIBILI-styled panel that renders a small STATIC placeholder friend list
 * (clearly labelled "sample" / "近日公開") built purely from the local
 * GACHA_CHARS avatars, plus a real "invite/join by room code" affordance that
 * reuses the exact same router-push-to-/room/<CODE> flow the Lobby already uses
 * for "友達の部屋に入る". No fake friends API is fabricated: the list is a mock,
 * and the only working action here is joining a friend's room by code.
 */

// Static placeholder roster. Uses local muse avatars (the only allowed images)
// so the styled list has faces to render. `st` is a status key resolved through
// t() below; there is no live presence — this is explicitly a sample.
const PLACEHOLDER_FRIENDS: {
  charId: string;
  name: string;
  status: "対戦中" | "ロビー" | "ガチャ中" | "オフライン";
}[] = [
  { charId: "grungia", name: "ハル", status: "対戦中" },
  { charId: "meilan", name: "ケン", status: "ロビー" },
  { charId: "honey", name: "リサ", status: "ガチャ中" },
  { charId: "velvet", name: "ミオ", status: "オフライン" },
  { charId: "sakura", name: "ユウ", status: "オフライン" },
];

const CHAR_BY_ID = new Map(GACHA_CHARS.map((c) => [c.id, c]));

export function FriendsScreen({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const router = useRouter();
  const [code, setCode] = useState("");

  const friends = PLACEHOLDER_FRIENDS.map((f) => ({
    ...f,
    char: CHAR_BY_ID.get(f.charId) ?? GACHA_CHARS[0],
    online: f.status !== "オフライン",
  }));
  const onlineCount = friends.filter((f) => f.online).length;

  // Reuses the Lobby's "join by room code" flow verbatim: navigate to
  // /room/<CODE> and let the existing room join/create logic take over.
  function join() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    router.push(`/room/${c}`);
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

      <div className="friends-layout">
        <div className="panel">
          <h3>
            {t("フレンドリスト")}
            <small>{t("サンプル")}</small>
          </h3>

          <p className="tiny muted" style={{ marginTop: 8 }}>
            {t("フレンド機能は準備中です。近日公開！")}
          </p>

          <div className="friend-list friends-screen-list">
            {friends.map((f) => (
              <div
                key={f.charId}
                className={"friend friends-screen-row" + (f.online ? "" : " off")}
              >
                <span
                  className="av"
                  aria-hidden
                  style={{ backgroundImage: `url(${f.char.img})`, backgroundPosition: f.char.focus }}
                />
                <span className="nm">{f.name}</span>
                <span className={"st" + (f.online ? "" : " off")}>
                  {f.online ? "● " : "○ "}
                  {t(f.status)}
                </span>
              </div>
            ))}
          </div>
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
