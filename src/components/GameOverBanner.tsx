"use client";

import { useEffect, useState } from "react";
import { MATCH_GEMS, type PublicPlayer } from "@/lib/protocol";
import { api } from "@/lib/clientApi";
import { useT } from "@/lib/i18n";
import { tierLabel, type UserRank } from "@/lib/rank";
import { GACHA_CHARS } from "@/lib/gachaChars";
import { RankIcon } from "./RankIcon";

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
  meId,
  isHost,
  busy,
  ranked = false,
  onRematch,
  onHome,
}: {
  players: PublicPlayer[];
  winnerId: string | null | undefined;
  meId: string;
  isHost: boolean;
  busy: boolean;
  /** state.settings.ranked — enables the post-match LP readout. */
  ranked?: boolean;
  onRematch: () => void;
  onHome: () => void;
}) {
  const t = useT();
  const muse = celebrationChar(winnerId);
  const me = players.find((p) => p.userId === meId);
  const iWon = winnerId === meId;

  // Post-match ladder standing. The server applies apply_rank_result AFTER the
  // gameover state is persisted/broadcast (rooms.ts persist → recordTransitions),
  // so a single immediate fetch can read the pre-match row. Poll twice (1.5s /
  // 4.5s) and keep the latest — the second read is comfortably after recording.
  const [postRank, setPostRank] = useState<UserRank | null>(null);
  useEffect(() => {
    if (!ranked || !me || me.isBot) return;
    let active = true;
    const fetchRank = () =>
      api<{ rank: UserRank }>("/api/rank/me", {})
        .then((r) => {
          if (active) setPostRank(r.rank);
        })
        .catch(() => {});
    const t1 = setTimeout(fetchRank, 1500);
    const t2 = setTimeout(fetchRank, 4500);
    return () => {
      active = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // Mount-once: the banner appears exactly when the game ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // LP delta is deterministic client-side (mirrors applyResult: win +25 / loss
  // −20); a win that lands on 0LP can only be a tier promotion (pre-LP ≥ 75).
  const promoted = iWon && postRank?.lp === 0;
  // Mirror of the server-side grant in recordMatchEnd (bots earn nothing).
  const humanCount = players.filter((p) => !p.isBot).length;
  const solo = humanCount <= 1;
  const myGems = me?.isBot
    ? 0
    : winnerId === meId
      ? solo
        ? MATCH_GEMS.soloWin
        : MATCH_GEMS.win
      : solo
        ? MATCH_GEMS.soloPlay
        : MATCH_GEMS.play;
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
      {myGems > 0 && (
        <div className="notice tiny" style={{ textAlign: "center" }}>
          {winnerId === meId
            ? t("🏆 勝利報酬 +{n}💎 を獲得！ガチャで使えます", { n: myGems })
            : t("🎁 参加報酬 +{n}💎 を獲得！ガチャで使えます", { n: myGems })}
        </div>
      )}
      {ranked && postRank && (
        <div
          className="notice tiny row"
          style={{ justifyContent: "center", alignItems: "center", gap: 6 }}
        >
          <RankIcon tier={postRank.tier} size={18} />
          <span>
            {t(tierLabel(postRank.tier))} {postRank.lp}LP
          </span>
          <span style={{ fontWeight: 700, color: iWon ? "var(--gold, #FFC44D)" : "inherit" }}>
            {iWon ? "+25LP" : "−20LP"}
          </span>
          {promoted && <span className="pill">⬆ {t("昇格！")}</span>}
        </div>
      )}
      {isHost ? (
        <button className="btn gold block" disabled={busy} onClick={onRematch}>
          🔁 {t("同じメンバーでもう一回")}
        </button>
      ) : (
        <div className="tiny muted" style={{ textAlign: "center" }}>
          {t("ホストが再戦を始めると、そのまま次のゲームに入れます")}
        </div>
      )}
      <button className="btn block" onClick={onHome}>
        {t("ホームに戻る")}
      </button>
    </div>
  );
}
