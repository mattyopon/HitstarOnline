"use client";

import { CATEGORIES, type PublicState } from "@/lib/protocol";
import { useT } from "@/lib/i18n";

function modeLabel(mode: string): string {
  if (mode === "pro") return "プロ";
  if (mode === "expert") return "エキスパート";
  return "オリジナル";
}

function catLabels(categories: string[]): string {
  if (!categories || categories.length === 0) return "全ジャンル";
  return categories.map((id) => CATEGORIES.find((c) => c.id === id)?.labelJa ?? id).join("・");
}

/** Pre-game waiting card: room code, copy/invite, rule summary, start button. */
export function LobbyWaitingCard({
  state,
  isHost,
  busy,
  actionErr,
  onStart,
}: {
  state: PublicState;
  isHost: boolean;
  busy: boolean;
  actionErr: string | null;
  onStart: () => void;
}) {
  const t = useT();
  // With 2+ connected humans, "start" opens a genre majority-vote instead of
  // dealing immediately — relabel the button so the host knows.
  const humans = state.players.filter((p) => p.connected && !p.isBot).length;
  const startLabel = humans >= 2 ? t("🗳️ ジャンル投票を開始") : t("🎶 ゲーム開始");
  return (
    <div className="card stack">
      <div className="row" style={{ gap: 14 }}>
        <span className="vinyl-mark" aria-hidden="true" />
        <div>
          <div className="section-eyebrow">Side A · Waiting Room</div>
          <h2 className="section-ttl" style={{ marginTop: 0 }}>{t("友達を待っています…")}</h2>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("下のコードを友達に伝えてください。同じコードで参加すると一緒に遊べます。")}
      </p>
      <div className="row" style={{ justifyContent: "center", gap: 14 }}>
        <span className="code-pill">{state.code}</span>
        <button className="btn sm outline" onClick={() => navigator.clipboard?.writeText(state.code)}>
          {t("コピー")}
        </button>
        <button
          className="btn sm outline"
          onClick={() => navigator.clipboard?.writeText(`${location.origin}/room/${state.code}`)}
        >
          {t("招待リンク")}
        </button>
      </div>
      <div className="notice tiny">
        {t("ルール: {mode} ／ {n}枚で勝利 ／ 開始トークン{tokens}", {
          mode: t(modeLabel(state.settings.mode)),
          n: state.settings.targetCards,
          tokens: state.settings.startingTokens,
        })}
        <br />
        {t("カテゴリ: {cats}", { cats: t(catLabels(state.settings.categories)) })}
      </div>
      {actionErr && <div className="error">{actionErr}</div>}
      {isHost ? (
        <button className="btn block" disabled={busy || state.players.length < 2} onClick={onStart}>
          {state.players.length < 2 ? t("2人以上で開始できます") : startLabel}
        </button>
      ) : (
        <div className="notice">{t("ホストの開始を待っています…")}</div>
      )}
    </div>
  );
}
