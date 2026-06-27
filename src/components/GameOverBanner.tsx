"use client";

import type { PublicPlayer } from "@/lib/protocol";
import { useT } from "@/lib/i18n";

/** Final standings banner shown when the game ends. */
export function GameOverBanner({
  players,
  winnerId,
  onHome,
}: {
  players: PublicPlayer[];
  winnerId: string | null | undefined;
  onHome: () => void;
}) {
  const t = useT();
  return (
    <div className="card big-banner stack">
      <div className="trophy">🏆</div>
      <h2 style={{ margin: 0 }}>
        {t("{name} の勝ち！", {
          name: players.find((p) => p.userId === winnerId)?.name ?? "?",
        })}
      </h2>
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        {[...players]
          .sort((a, b) => b.timeline.length - a.timeline.length || b.tokens - a.tokens)
          .map((p, i) => (
            <div key={p.userId} className="row spread">
              <span>
                {t("{n}位 {name}", { n: i + 1, name: p.name })}
              </span>
              <span className="muted">
                🃏 {Math.max(0, p.timeline.length - 1)} ／ 🪙 {p.tokens}
              </span>
            </div>
          ))}
      </div>
      <button className="btn block" onClick={onHome}>
        {t("ホームに戻る")}
      </button>
    </div>
  );
}
