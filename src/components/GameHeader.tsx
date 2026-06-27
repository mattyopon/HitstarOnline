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
    <div className="row spread" style={{ marginBottom: 16 }}>
      <div className="brand header" style={{ gap: 8 }}>
        <div className="logo" />
        <h1 style={{ fontSize: 18 }}>Hitstar Online</h1>
      </div>
      <div className="row wrap" style={{ gap: 10 }}>
        <span className="pill">
          {t("部屋")} <strong style={{ letterSpacing: 2 }}>{code}</strong>
        </span>
        {inGame && <span className="pill">{t("第{n}ターン", { n: round })}</span>}
        {inGame && <span className="pill">{t("残り{n}曲", { n: deckRemaining })}</span>}
        <button className="btn ghost tiny" onClick={onSettings} title={t("設定")}>
          ⚙️
        </button>
        <button className="btn ghost tiny" onClick={onLeave}>
          {t("退出")}
        </button>
      </div>
    </div>
  );
}
