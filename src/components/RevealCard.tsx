"use client";

import { useState } from "react";
import type { PublicState } from "@/lib/protocol";
import { addToFavorites, type FavoriteResult } from "@/lib/youtubeFavorites";

export function RevealCard({
  state,
  googleToken,
}: {
  state: PublicState;
  googleToken?: string | null;
}) {
  const [fav, setFav] = useState<"idle" | "saving" | FavoriteResult>("idle");
  const r = state.reveal;
  if (!r) return null;

  async function onFavorite(videoId: string) {
    setFav("saving");
    setFav(await addToFavorites(googleToken ?? null, videoId));
  }
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

      {googleToken && r.youtubeId && (
        <div className="stack" style={{ gap: 4, alignItems: "center", marginTop: 4 }}>
          <button
            className="btn gold"
            disabled={fav === "saving" || fav === "added"}
            onClick={() => onFavorite(r.youtubeId!)}
          >
            {fav === "added"
              ? "★ お気に入り追加済み"
              : fav === "saving"
                ? "追加中…"
                : "★ お気に入りに追加"}
          </button>
          {fav === "added" && (
            <span className="tiny muted">YouTubeの「{`Hitstar お気に入り`}」に追加しました</span>
          )}
          {fav === "scope" && (
            <span className="tiny tag-wrong">
              連携の有効期限切れか権限不足です。一度ログアウトし、Googleで再ログインしてYouTube連携を許可してください。
            </span>
          )}
          {fav === "quota" && (
            <span className="tiny tag-wrong">YouTube APIの上限に達しました。しばらくしてからお試しください。</span>
          )}
          {fav === "error" && <span className="tiny tag-wrong">追加に失敗しました。もう一度お試しください。</span>}
        </div>
      )}
    </div>
  );
}
