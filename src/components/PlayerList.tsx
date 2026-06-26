"use client";

import type { PublicState } from "@/lib/protocol";
import { RankIcon } from "./RankIcon";
import { Timeline } from "./Timeline";
import { useT } from "@/lib/i18n";

export function PlayerList({
  state,
  meId,
}: {
  state: PublicState;
  meId: string;
}) {
  const t = useT();
  const activeId = state.order[state.activeIndex];
  const target = state.settings.targetCards;
  const inGame = state.phase !== "lobby";

  return (
    <div className="card stack" style={{ padding: 14 }}>
      <div className="row spread">
        <strong>{t("プレイヤー（{n}）", { n: state.players.length })}</strong>
        {inGame && <span className="tiny muted">{t("🏆 {n}枚で勝利", { n: target })}</span>}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {state.players.map((p) => {
          const won = Math.max(0, p.timeline.length - 1);
          return (
            <div
              key={p.userId}
              className={"player-block" + (inGame && p.userId === activeId ? " active" : "")}
            >
              <div className="player-row">
                <span className="avatar avatar--md">
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt="" />
                  ) : (
                    p.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="name">
                  <RankIcon tier={p.tier} size={18} />
                  {p.name}
                  {p.userId === meId && <span className="muted tiny">{t("（あなた）")}</span>}
                  {p.userId === state.hostId && <span className="tiny"> 👑</span>}
                </span>
                <span className="meta">
                  {inGame && (
                    <span className="tiny">
                      🃏 {won}/{target}
                    </span>
                  )}
                  {inGame && <span className="token tiny">🪙 {p.tokens}</span>}
                  <span
                    className={"dot" + (p.connected ? " on" : "")}
                    title={p.connected ? t("オンライン") : t("オフライン")}
                  />
                </span>
              </div>
              {/* Everyone's hand (won cards) is public — always visible. */}
              {inGame && p.timeline.length > 0 && (
                <Timeline cards={p.timeline} compact />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
