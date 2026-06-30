"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/clientApi";
import { useT } from "@/lib/i18n";
import type { UserStats, CategoryAccuracy } from "@/lib/stats";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function CatRow({ c }: { c: CategoryAccuracy }) {
  const t = useT();
  return (
    <div className="row spread" style={{ gap: 8 }}>
      <span className="tiny" style={{ flex: "0 0 96px" }}>
        {c.labelJa}
      </span>
      <div className="bar" style={{ flex: 1 }}>
        <div style={{ width: pct(c.accuracy) }} />
      </div>
      <span className="tiny muted" style={{ width: 64, textAlign: "right" }}>
        {t("{p}（{n}回）", { p: pct(c.accuracy), n: c.attempts })}
      </span>
    </div>
  );
}

export function StatsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ stats: UserStats | null }>("/api/stats")
      .then((d) => {
        if (active) setStats(d.stats);
      })
      .catch((e) => active && setErr(e instanceof Error ? e.message : t("取得に失敗しました")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [t]);

  return (
    <div className="tap-overlay" onClick={onClose}>
      <div
        className="card stack"
        style={{ maxWidth: 460, width: "100%", maxHeight: "86vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row spread">
          <div>
            <div className="section-eyebrow">Side B · Record Sheet</div>
            <h2 className="section-ttl" style={{ margin: 0 }}>{t("📊 戦績")}</h2>
          </div>
          <button className="btn outline sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className="row" style={{ justifyContent: "center", padding: 24 }}>
            <span className="spin-loader" />
          </div>
        ) : err ? (
          <div className="error">{err}</div>
        ) : !stats || stats.games === 0 ? (
          <p className="muted">
            {t("まだ対戦記録がありません。マルチプレイやランクマッチで遊ぶとここに戦績が貯まります！")}
          </p>
        ) : (
          <>
            <div className="stats-grid">
              <Stat label={t("対戦数")} value={String(stats.games)} />
              <Stat label={t("1位回数")} value={String(stats.wins)} />
              <Stat label={t("勝率")} value={pct(stats.winRate)} />
              <Stat label={t("平均順位")} value={stats.avgRank ? stats.avgRank.toFixed(1) : "-"} />
              <Stat label={t("獲得カード")} value={String(stats.totalCards)} />
              <Stat
                label={t("ランク戦")}
                value={t("{w}勝 / {g}戦", { w: stats.rankedWins, g: stats.rankedGames })}
              />
            </div>

            {stats.strong.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <strong className="section-eyebrow" style={{ marginBottom: 0 }}>{t("💪 得意なカテゴリ")}</strong>
                {stats.strong.map((c) => (
                  <CatRow key={c.category} c={c} />
                ))}
              </div>
            )}
            {stats.weak.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <strong className="section-eyebrow" style={{ marginBottom: 0 }}>{t("😅 苦手なカテゴリ")}</strong>
                {stats.weak.map((c) => (
                  <CatRow key={c.category} c={c} />
                ))}
              </div>
            )}
            {stats.strong.length === 0 && stats.weak.length === 0 && (
              <p className="tiny muted">
                {t("カテゴリ別の得意/苦手は、もう少し遊ぶと表示されます（各3回以上）。")}
              </p>
            )}

            {stats.recent.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <strong className="section-eyebrow" style={{ marginBottom: 0 }}>{t("最近の対戦")}</strong>
                {stats.recent.map((r, i) => (
                  <div key={i} className="row spread tiny">
                    <span>
                      {r.isWinner ? "🏆" : t("{n}位", { n: r.rank })} ／ {t(modeJa(r.mode))}
                      {r.ranked && <span className="pill" style={{ marginLeft: 6 }}>{t("ランク")}</span>}
                    </span>
                    <span className="muted">
                      {t("🃏{c}・{p}人", { c: r.cardsWon, p: r.playerCount })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-box">
      <div className="stat-val">{value}</div>
      <div className="tiny muted">{label}</div>
    </div>
  );
}

function modeJa(mode: string): string {
  if (mode === "pro") return "プロ";
  if (mode === "expert") return "エキスパート";
  return "オリジナル";
}
