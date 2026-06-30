"use client";

import type { PublicPlayer } from "@/lib/protocol";
import { PlacementArea } from "./PlacementArea";
import { Timeline } from "./Timeline";
import { useT } from "@/lib/i18n";

/** The steal phase: shows the active player's placement and (for opponents) the
 *  steal/pass controls or the "横取りしない" auto-pass preference. */
export function StealPanel({
  me,
  isActive,
  activePlayer,
  placementSlot,
  selectedSlot,
  setSelectedSlot,
  dontSteal,
  setDontSteal,
  myStealDecided,
  secondsLeft,
  busy,
  act,
}: {
  me: PublicPlayer | undefined;
  isActive: boolean;
  activePlayer: PublicPlayer | undefined;
  placementSlot: number | null;
  selectedSlot: number | null;
  setSelectedSlot: (s: number | null) => void;
  dontSteal: boolean;
  setDontSteal: (v: boolean) => void;
  myStealDecided: boolean;
  secondsLeft: number | null;
  busy: boolean;
  act: (path: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useT();
  return (
    <div className="card stack fade-in">
      <strong className="serif" style={{ fontStyle: "italic", fontSize: 18 }}>
        {activePlayer?.name} {t("の配置はここ 👇")}
      </strong>
      {activePlayer && (
        <Timeline cards={activePlayer.timeline} mysterySlot={placementSlot} compact />
      )}
      {!isActive && (
        <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={dontSteal}
            onChange={(e) => {
              setDontSteal(e.target.checked);
              try {
                localStorage.setItem("hitstar_dont_steal", String(e.target.checked));
              } catch {
                /* ignore */
              }
            }}
            style={{ width: "auto" }}
          />
          <span className="tiny">{t("横取りしない（ONなら自動でパス）")}</span>
        </label>
      )}
      {isActive ? (
        <div className="notice">{t("相手の判断を待っています…（{s}s）", { s: secondsLeft ?? 0 })}</div>
      ) : myStealDecided ? (
        <div className="notice">{t("決定済み！結果を待っています")}</div>
      ) : !me || me.tokens <= 0 ? (
        <div className="muted">{t("トークンがないため横取りできません。")}</div>
      ) : dontSteal ? (
        <div className="notice">{t("「横取りしない」設定のためスキップします…")}</div>
      ) : (
        <>
          <strong className="serif" style={{ fontStyle: "italic", fontSize: 16 }}>
            {t("違うと思う？正しい位置に置いて横取り！（🪙1・あと{s}s）", { s: secondsLeft ?? 0 })}
          </strong>
          <PlacementArea
            cards={me.timeline}
            selectedSlot={selectedSlot}
            onSelect={setSelectedSlot}
            hint={t("違うと思う位置にタイルをドラッグ（タップでもOK）")}
          />
          <div className="row wrap">
            <button
              className="btn terra"
              disabled={busy || selectedSlot === null}
              onClick={() => act("/api/game/steal", { slotIndex: selectedSlot })}
            >
              {t("横取りする 🪙1")}
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => act("/api/game/steal-pass", {})}>
              {t("パス")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
