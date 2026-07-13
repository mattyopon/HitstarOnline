"use client";

import { useT } from "@/lib/i18n";
import { MATCH_GEMS } from "@/lib/protocol";

/**
 * In-app rules explainer. Previously the rules lived only in the README, so a
 * first-time player who joined via an invite link had NO way to learn how to
 * play. Pure chrome UI — every string flows through t().
 */
export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const Row = ({ icon, title, body }: { icon: string; title: string; body: string }) => (
    <div className="stack" style={{ gap: 2 }}>
      <strong>
        {icon} {title}
      </strong>
      <span className="tiny muted">{body}</span>
    </div>
  );
  return (
    <div className="tap-overlay" onClick={onClose}>
      <div
        className="card stack"
        style={{ maxWidth: 480, width: "100%", maxHeight: "84vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row spread">
          <div>
            <div className="section-eyebrow">Liner Notes · How to Play</div>
            <h2 className="section-ttl" style={{ margin: 0 }}>❓ {t("遊び方")}</h2>
          </div>
          <button className="btn outline sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <Row
          icon="🎯"
          title={t("目的")}
          body={t(
            "曲を聴いて「発売年」を推理し、自分の年表の正しい位置に並べます。最初の1枚を除いて10枚集めた人の勝ち！",
          )}
        />
        <Row
          icon="🎧"
          title={t("自分の番")}
          body={t(
            "曲が流れたら、年表のどこに入るかをカルーセルで選んで「提出」。正しい位置ならカード獲得。曲名とアーティストも当てるとオリジナルモードではトークン🪙+1。",
          )}
        />
        <Row
          icon="⚡"
          title={t("早置きボーナス")}
          body={t("曲が始まって10秒以内に正しく配置すると🪙+2のボーナス！")}
        />
        <Row
          icon="🪙"
          title={t("トークンの使い道")}
          body={t(
            "スキップ(🪙1)=別の曲に変更 ／ 購入(🪙3)=自動で正しい位置に配置 ／ 試聴延長(🪙1)=+60秒。聴いているだけの人は無料で延長できます。",
          )}
        />
        <Row
          icon="🥷"
          title={t("横取り")}
          body={t(
            "他の人が配置した後、🪙1で「本当はここでしょ」と挑戦できます。自分の年表で正しければカードを奪えます！",
          )}
        />
        <Row
          icon="🎬"
          title={t("ボーナス問題")}
          body={t("作品縛りパックでは正解発表時に「このアニメは？」クイズが出ることも。最速正解で🪙+1。")}
        />
        <Row
          icon="🏆"
          title={t("モード")}
          body={t(
            "オリジナル=配置だけで獲得 ／ プロ・エキスパート=曲名+アーティスト正解も獲得の条件(上級者向け)。ランク戦はエキスパートで戦績が記録されます。",
          )}
        />
        <Row
          icon="💎"
          title={t("対戦報酬")}
          body={t("試合が終わると勝者+{w}💎・参加者+{p}💎。貯めたジェムでガチャを引いてミューズを集めよう！", {
            w: MATCH_GEMS.win,
            p: MATCH_GEMS.play,
          })}
        />

        <button className="btn gold block" onClick={onClose}>
          {t("わかった！")}
        </button>
      </div>
    </div>
  );
}
