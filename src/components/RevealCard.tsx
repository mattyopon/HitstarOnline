"use client";

import type { PublicState } from "@/lib/protocol";

export function RevealCard({ state }: { state: PublicState }) {
  const r = state.reveal;
  if (!r) return null;
  const nameOf = (id: string | null) =>
    id ? state.players.find((p) => p.userId === id)?.name ?? "?" : null;

  let outcome: React.ReactNode;
  if (r.bought) {
    outcome = (
      <span className="tag-correct">
        💳 {nameOf(r.awardedTo)} がカードを購入して獲得
      </span>
    );
  } else if (r.awardedTo && r.activeCorrect) {
    outcome = <span className="tag-correct">✅ {nameOf(r.awardedTo)} が正解！カード獲得</span>;
  } else if (r.awardedTo) {
    outcome = <span className="tag-correct">🦹 {nameOf(r.awardedTo)} が横取り成功！</span>;
  } else {
    outcome = <span className="tag-wrong">❌ 誰も当てられず…カードは捨て札に</span>;
  }

  return (
    <div className="card stack fade-in" style={{ alignItems: "center", textAlign: "center" }}>
      <div className="muted tiny">正解は…</div>
      <div className="reveal-year">{r.year}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{r.title}</div>
      <div className="muted">{r.artist}</div>
      <div style={{ marginTop: 6 }}>{outcome}</div>
      {r.reason && <div className="tiny muted">{r.reason}</div>}
      {r.tokenAwards
        .filter((a) => a.tokensGained > 0)
        .map((a) => (
          <div key={a.userId} className="tiny token">
            🪙 {nameOf(a.userId)} が曲名＋アーティスト正解でトークン獲得！
          </div>
        ))}
      {r.youtubeId && (
        <a
          className="tiny"
          href={`https://www.youtube.com/watch?v=${r.youtubeId}`}
          target="_blank"
          rel="noreferrer"
        >
          YouTubeで開く ↗
        </a>
      )}
    </div>
  );
}
