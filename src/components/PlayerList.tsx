"use client";

import type { PublicState } from "@/lib/protocol";

export function PlayerList({
  state,
  meId,
}: {
  state: PublicState;
  meId: string;
}) {
  const activeId = state.order[state.activeIndex];
  const target = state.settings.targetCards;
  const inGame = state.phase !== "lobby";

  return (
    <div className="card stack" style={{ padding: 14 }}>
      <div className="row spread">
        <strong>プレイヤー（{state.players.length}）</strong>
        {inGame && <span className="tiny muted">🏆 {target}枚で勝利</span>}
      </div>
      <div className="stack" style={{ gap: 4 }}>
        {state.players.map((p) => {
          const won = Math.max(0, p.timeline.length - 1);
          return (
            <div
              key={p.userId}
              className={"player-row" + (inGame && p.userId === activeId ? " active" : "")}
            >
              <span className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatarUrl} alt="" />
                ) : (
                  p.name.charAt(0).toUpperCase()
                )}
              </span>
              <span className="name">
                {p.name}
                {p.userId === meId && <span className="muted tiny">（あなた）</span>}
                {p.userId === state.hostId && <span className="tiny"> 👑</span>}
              </span>
              <span className="meta">
                {inGame && <span className="tiny">🃏 {won}/{target}</span>}
                {inGame && <span className="token tiny">🪙 {p.tokens}</span>}
                <span className={"dot" + (p.connected ? " on" : "")} title={p.connected ? "オンライン" : "オフライン"} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
