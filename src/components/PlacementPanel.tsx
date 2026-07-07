"use client";

import type { GameSettings, PublicPlayer } from "@/lib/protocol";
import { PlacementCarousel } from "./PlacementCarousel";
import { useT } from "@/lib/i18n";

/** The active player's placement controls: optional guess, tap-to-place, and
 *  the extend / skip / buy actions. Rendered only on the active player's turn. */
export function PlacementPanel({
  settings,
  me,
  isListening,
  inEarlyWindow,
  earlyLeft,
  selectedSlot,
  setSelectedSlot,
  gTitle,
  setGTitle,
  gArtist,
  setGArtist,
  busy,
  canExtend,
  canSkip,
  canBuy,
  listeningExtended,
  act,
}: {
  settings: GameSettings;
  me: PublicPlayer;
  isListening: boolean;
  inEarlyWindow: boolean;
  earlyLeft: number;
  selectedSlot: number | null;
  setSelectedSlot: (s: number | null) => void;
  gTitle: string;
  setGTitle: (s: string) => void;
  gArtist: string;
  setGArtist: (s: string) => void;
  busy: boolean;
  canExtend: boolean;
  canSkip: boolean;
  canBuy: boolean;
  listeningExtended: boolean;
  act: (path: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useT();
  return (
    <div className="card stack fade-in">
      <div className="row spread" style={{ alignItems: "center" }}>
        <strong>
          {isListening
            ? t("🎧 曲を聞いて、位置をタップで配置")
            : t("⏳ {n}秒以内に位置をタップで配置", { n: settings.placementSeconds ?? 30 })}
        </strong>
        {inEarlyWindow && (
          <span
            className="pill"
            style={{ borderColor: "var(--gold)", color: "var(--gold)" }}
            title={t("開始10秒以内に正解配置でトークン2枚")}
          >
            {t("⚡早置き +{n}🪙 あと{s}s", { n: settings.earlyBonusTokens ?? 2, s: earlyLeft })}
          </span>
        )}
      </div>
      {/* Guess FIRST, then choose a slot and press 提出 to submit. In pro/expert
          naming is REQUIRED to keep the card (no token reward); in original it's
          optional and both-correct earns a token — so label it per mode. */}
      <div className="row wrap" style={{ gap: 10 }}>
        <input
          type="text"
          placeholder={
            settings.mode === "original"
              ? t("曲名（任意・当てるとトークン）")
              : t("曲名（獲得に必須）")
          }
          value={gTitle}
          onChange={(e) => setGTitle(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <input
          type="text"
          placeholder={
            settings.mode === "original" ? t("アーティスト名（任意）") : t("アーティスト名（獲得に必須）")
          }
          value={gArtist}
          onChange={(e) => setGArtist(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
      </div>
      <PlacementCarousel
        cards={me.timeline}
        selectedSlot={selectedSlot}
        onSelect={setSelectedSlot}
      />
      <div className="placement-hint">
        {t("カードを回して中央で位置を選び、「提出」で確定")}
      </div>
      {/* Selecting a slot only stages the card; submit confirms it. On timeout the
          staged slot is auto-submitted (handled in GameRoom). */}
      <button
        className="btn block"
        disabled={busy || selectedSlot == null}
        onClick={() =>
          act("/api/game/place", {
            slotIndex: selectedSlot,
            guess: { title: gTitle, artist: gArtist },
          })
        }
      >
        ✅ {t("この位置で提出")}
      </button>
      <div className="row wrap">
        {canExtend && (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => act("/api/game/extend", {})}
            title={t("トークン{cost}枚で試聴を{sec}秒延長（1回のみ）", { cost: settings.extendCost ?? 1, sec: settings.extendSeconds ?? 60 })}
          >
            {t("⏱ 延長 +{s}s 🪙{cost}", { s: settings.extendSeconds ?? 60, cost: settings.extendCost ?? 1 })}
          </button>
        )}
        <button
          className="btn secondary"
          disabled={busy || !canSkip}
          onClick={() => act("/api/game/skip", {})}
          title={t("トークン1枚で別の曲に")}
        >
          {t("スキップ 🪙1")}
        </button>
        <button
          className="btn gold"
          disabled={busy || !canBuy}
          onClick={() => act("/api/game/buy", {})}
          title={t("トークン{cost}枚で自動的に正しい位置へ", { cost: settings.buyCost })}
        >
          {t("購入 🪙{cost}", { cost: settings.buyCost })}
        </button>
      </div>
      {(settings.placementTokens ?? 1) > 0 && (
        <div className="tiny muted">
          {t("✅ 正しい位置に置けば毎ターン 🪙+{n}", { n: settings.placementTokens ?? 1 })}
        </div>
      )}
      <div className="tiny muted">
        {t("あなたのトークン:")} <span className="token">🪙 {me.tokens}</span>
        {listeningExtended && <span className="muted">{t("　（延長済み）")}</span>}
      </div>
    </div>
  );
}
