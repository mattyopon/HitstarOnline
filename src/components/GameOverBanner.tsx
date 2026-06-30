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
      <div className="section-eyebrow" style={{ marginBottom: 0 }}>Side B · Final Standings</div>
      <div className="trophy">🏆</div>
      <h2 className="section-ttl" style={{ margin: 0 }}>
        {t("{name} の勝ち！", {
          name: players.find((p) => p.userId === winnerId)?.name ?? "?",
        })}
      </h2>
      <div className="divider" aria-hidden="true">★</div>
      <div className="stack" style={{ gap: 6, marginTop: 4 }}>
        {[...players]
          .sort((a, b) => b.timeline.length - a.timeline.length || b.tokens - a.tokens)
          .map((p, i) => (
            <div key={p.userId} className="row spread">
              <span className="serif" style={{ fontStyle: "italic", fontWeight: 700 }}>
                {t("{n}位 {name}", { n: i + 1, name: p.name })}
              </span>
              <span className="mono muted" style={{ fontSize: 12 }}>
                🃏 {Math.max(0, p.timeline.length - 1)} ／ 🪙 {p.tokens}
              </span>
            </div>
          ))}
      </div>
      <button className="btn gold block" onClick={onHome}>
        {t("ホームに戻る")}
      </button>
    </div>
  );
}
