"use client";

import { CATEGORIES, type PublicState } from "@/lib/protocol";

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
  return (
    <div className="card stack">
      <h2 style={{ marginTop: 0 }}>友達を待っています…</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        下のコードを友達に伝えてください。同じコードで参加すると一緒に遊べます。
      </p>
      <div className="row" style={{ justifyContent: "center", gap: 14 }}>
        <span className="code-pill">{state.code}</span>
        <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(state.code)}>
          コピー
        </button>
        <button
          className="btn secondary"
          onClick={() => navigator.clipboard?.writeText(`${location.origin}/room/${state.code}`)}
        >
          招待リンク
        </button>
      </div>
      <div className="notice tiny">
        ルール: {modeLabel(state.settings.mode)} ／ {state.settings.targetCards}枚で勝利 ／
        開始トークン{state.settings.startingTokens}
        <br />
        カテゴリ: {catLabels(state.settings.categories)}
      </div>
      {actionErr && <div className="error">{actionErr}</div>}
      {isHost ? (
        <button className="btn block" disabled={busy || state.players.length < 2} onClick={onStart}>
          {state.players.length < 2 ? "2人以上で開始できます" : "🎶 ゲーム開始"}
        </button>
      ) : (
        <div className="notice">ホストの開始を待っています…</div>
      )}
    </div>
  );
}
