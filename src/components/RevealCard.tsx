"use client";

import { memo, useState } from "react";
import type { PublicState } from "@/lib/protocol";
import { addToFavorites, type FavoriteResult } from "@/lib/youtubeFavorites";
import { useT } from "@/lib/i18n";

// Memoized so the parent's ~500ms clock tick doesn't re-render the reveal card.
export const RevealCard = memo(function RevealCard({
  state,
  googleToken,
}: {
  state: PublicState;
  googleToken?: string | null;
}) {
  const t = useT();
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
        💳 {t("{name} がカードを購入して獲得", { name: nameOf(r.awardedTo) ?? "?" })}
      </span>
    );
  } else if (r.awardedTo && r.activeCorrect) {
    outcome = (
      <span className="tag-correct">
        ✅ {t("{name} が正解！カード獲得", { name: nameOf(r.awardedTo) ?? "?" })}
      </span>
    );
  } else if (r.awardedTo) {
    outcome = (
      <span className="tag-correct">
        🦹 {t("{name} が横取り成功！", { name: nameOf(r.awardedTo) ?? "?" })}
      </span>
    );
  } else {
    outcome = <span className="tag-wrong">❌ {t("誰も当てられず…カードは捨て札に")}</span>;
  }

  return (
    <div className="card stack fade-in" style={{ alignItems: "center", textAlign: "center" }}>
      <div className="section-eyebrow" style={{ marginBottom: 0 }}>{t("正解は…")}</div>
      <div className="reveal-year">{r.year}</div>
      <div className="serif" style={{ fontSize: 22, fontStyle: "italic", fontWeight: 700, lineHeight: 1.2 }}>
        {r.title}
      </div>
      <div className="mono tiny muted" style={{ letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {r.artist}
      </div>
      <div style={{ marginTop: 6 }}>{outcome}</div>
      {r.reason && <div className="tiny muted">{t(r.reason)}</div>}
      {r.tokenAwards
        .filter((a) => a.tokensGained > 0)
        .map((a, i) => (
          <div key={`${a.userId}-${i}`} className="tiny token">
            🪙{" "}
            {t("{name} {reason}で +{n}", {
              name: nameOf(a.userId) ?? "?",
              reason: a.reason ? t(a.reason) : t("曲名＋アーティスト正解"),
              n: a.tokensGained,
            })}
          </div>
        ))}
      {r.youtubeId && (
        <a
          className="tiny"
          href={`https://www.youtube.com/watch?v=${r.youtubeId}`}
          target="_blank"
          rel="noreferrer"
        >
          {t("YouTubeで開く ↗")}
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
              ? t("★ お気に入り追加済み")
              : fav === "saving"
                ? t("追加中…")
                : t("★ お気に入りに追加")}
          </button>
          {fav === "added" && (
            <span className="tiny muted">{t("YouTubeの「Hitstar お気に入り」に追加しました")}</span>
          )}
          {fav === "scope" && (
            <span className="tiny tag-wrong">
              {t(
                "連携の有効期限切れか権限不足です。一度ログアウトし、Googleで再ログインしてYouTube連携を許可してください。",
              )}
            </span>
          )}
          {fav === "quota" && (
            <span className="tiny tag-wrong">{t("YouTube APIの上限に達しました。しばらくしてからお試しください。")}</span>
          )}
          {fav === "error" && <span className="tiny tag-wrong">{t("追加に失敗しました。もう一度お試しください。")}</span>}
        </div>
      )}
    </div>
  );
});
