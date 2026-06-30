"use client";

import { useT } from "@/lib/i18n";

/** Top bar: brand + room code / turn / deck pills + settings/leave buttons. */
export function GameHeader({
  code,
  round,
  deckRemaining,
  inGame,
  onSettings,
  onLeave,
}: {
  code: string;
  round: number;
  deckRemaining: number;
  inGame: boolean;
  onSettings: () => void;
  onLeave: () => void;
}) {
  const t = useT();
  return (
    <div className="game-head">
      <div className="head-brand">
        <div className="vinyl-mark" aria-hidden="true" />
        <div className="nm">Hitstar Online</div>
      </div>
      <div className="meta">
        <div className="meta-stamp">
          <span className="k">{t("部屋")}</span>
          <span className="v">{code}</span>
        </div>
        {inGame && (
          <div className="meta-stamp" title={t("第{n}ターン", { n: round })}>
            <span className="k">{t("ターン")}</span>
            <span className="v">{round}</span>
          </div>
        )}
        {inGame && (
          <div className="meta-stamp" title={t("残り{n}曲", { n: deckRemaining })}>
            <span className="k">{t("デッキ")}</span>
            <span className="v">{deckRemaining}</span>
          </div>
        )}
        <button
          className="btn sm outline"
          style={{ alignSelf: "center" }}
          onClick={onSettings}
          title={t("設定")}
        >
          ⚙️
        </button>
        <button
          className="btn sm outline"
          style={{ alignSelf: "center" }}
          onClick={onLeave}
        >
          × {t("退出")}
        </button>
      </div>
    </div>
  );
}
