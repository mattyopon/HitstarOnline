"use client";

import type { GameSettings, PublicPlayer } from "@/lib/protocol";
import { PlacementArea } from "./PlacementArea";
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
            title="開始10秒以内に正解配置でトークン2枚"
          >
            ⚡早置き +{settings.earlyBonusTokens ?? 2}🪙 あと{earlyLeft}s
          </span>
        )}
      </div>
      {/* Optional guess FIRST, then tap a slot to place+submit instantly. */}
      <div className="row wrap" style={{ gap: 10 }}>
        <input
          type="text"
          placeholder={t("曲名（任意・当てるとトークン）")}
          value={gTitle}
          onChange={(e) => setGTitle(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <input
          type="text"
          placeholder={t("アーティスト名（任意）")}
          value={gArtist}
          onChange={(e) => setGArtist(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
      </div>
      <PlacementArea
        cards={me.timeline}
        selectedSlot={selectedSlot}
        hint={t("位置をタップ（またはドラッグ）すると、その場で提出します")}
        onSelect={(slot) => {
          // Tap-to-submit: selecting a slot places the card immediately.
          if (busy) return;
          const prev = selectedSlot;
          setSelectedSlot(slot);
          act("/api/game/place", {
            slotIndex: slot,
            guess: { title: gTitle, artist: gArtist },
          }).then((ok) => {
            // On failure, clear the ghost so it doesn't look placed.
            if (!ok) setSelectedSlot(prev);
          });
        }}
      />
      <div className="row wrap">
        {canExtend && (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => act("/api/game/extend", {})}
            title={`トークン${settings.extendCost ?? 1}枚で試聴を${settings.extendSeconds ?? 60}秒延長（1回のみ）`}
          >
            ⏱ 延長 +{settings.extendSeconds ?? 60}s 🪙{settings.extendCost ?? 1}
          </button>
        )}
        <button
          className="btn secondary"
          disabled={busy || !canSkip}
          onClick={() => act("/api/game/skip", {})}
          title="トークン1枚で別の曲に"
        >
          スキップ 🪙1
        </button>
        <button
          className="btn gold"
          disabled={busy || !canBuy}
          onClick={() => act("/api/game/buy", {})}
          title={`トークン${settings.buyCost}枚で自動的に正しい位置へ`}
        >
          購入 🪙{settings.buyCost}
        </button>
      </div>
      {(settings.placementTokens ?? 1) > 0 && (
        <div className="tiny muted">
          ✅ 正しい位置に置けば毎ターン 🪙+{settings.placementTokens ?? 1}
        </div>
      )}
      <div className="tiny muted">
        あなたのトークン: <span className="token">🪙 {me.tokens}</span>
        {listeningExtended && <span className="muted">　（延長済み）</span>}
      </div>
    </div>
  );
}
