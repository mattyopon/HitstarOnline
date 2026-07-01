"use client";

import type { PublicPlayer } from "@/lib/protocol";
import { useT } from "@/lib/i18n";
import { GACHA_CHARS } from "@/lib/gachaChars";

// Purely decorative "the muses celebrate with you" portrait — NOT a claim
// about which character the winner owns/plays (the game core has no concept
// of an equipped avatar character yet). Picked deterministically from the
// winner's id so the same match always shows the same celebratory muse,
// without needing any new server data.
function celebrationChar(winnerId: string | null | undefined) {
  if (!winnerId) return GACHA_CHARS[0];
  let h = 0;
  for (let i = 0; i < winnerId.length; i++) h = (h * 31 + winnerId.charCodeAt(i)) >>> 0;
  return GACHA_CHARS[h % GACHA_CHARS.length];
}

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
  const muse = celebrationChar(winnerId);
  return (
    <div className="card big-banner stack">
      <div className="section-eyebrow" style={{ marginBottom: 0 }}>Side B · Final Standings</div>
      <span className="av-circle" style={{ width: 76, height: 76, margin: "0 auto" }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={muse.img} alt="" style={{ objectPosition: muse.focus }} />
      </span>
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
