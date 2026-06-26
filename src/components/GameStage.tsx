"use client";

import type { ReactNode } from "react";
import type { Phase } from "@/lib/protocol";
import { YouTubePlayer } from "./YouTubePlayer";
import { useT } from "@/lib/i18n";

/** The "stage": phase title + countdown, the YouTube player, volume, and the
 *  unavailable-track notice. Pure presentation driven by props. */
export function GameStage({
  phase,
  isActive,
  isListening,
  activeName,
  playVideoId,
  playing,
  startSeconds,
  volume,
  onVolumeChange,
  revealMode,
  trackUnavailable,
  onUnavailable,
  countdownEl,
}: {
  phase: Phase;
  isActive: boolean;
  isListening: boolean;
  activeName: string;
  playVideoId: string | null;
  playing: boolean;
  startSeconds: number;
  volume: number;
  onVolumeChange: (v: number) => void;
  revealMode: boolean;
  trackUnavailable: boolean;
  onUnavailable: () => void;
  countdownEl: ReactNode;
}) {
  const t = useT();
  return (
    <div className="card stack">
      <div className="row spread">
        <strong>
          {phase === "placing" &&
            isListening &&
            (isActive ? t("🎧 試聴中（聞いて配置）") : t("🎧 {name} が試聴中", { name: activeName }))}
          {phase === "placing" &&
            !isListening &&
            (isActive ? t("⏳ 配置してOK！") : t("⏳ {name} が配置中", { name: activeName }))}
          {phase === "stealing" && t("横取りチャンス！")}
          {phase === "reveal" && t("結果発表")}
          {phase === "gameover" && t("ゲーム終了")}
        </strong>
        {/* Reveal plays the full song (long auto-advance) → hide the countdown. */}
        {phase !== "gameover" && phase !== "reveal" && countdownEl}
        {phase === "reveal" &&
          (playVideoId ? (
            <span className="pill">🎶 {t("フル再生中")}</span>
          ) : (
            <span className="pill">{t("音源を取得できませんでした")}</span>
          ))}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <YouTubePlayer
          videoId={playVideoId}
          startSeconds={startSeconds}
          playing={playing}
          reveal={revealMode}
          volume={volume}
          onUnavailable={onUnavailable}
        />
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center", justifyContent: "center" }}>
        <span className="tiny muted">🔊 曲の音量</span>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          style={{ width: 160 }}
          aria-label="曲の音量"
        />
        <span className="tiny muted" style={{ width: 32, textAlign: "right" }}>
          {volume}
        </span>
      </div>
      {trackUnavailable && (phase === "placing" || phase === "stealing") && (
        <div className="notice tiny" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
          ⚠️ {t("この曲は再生できないようです。")}
          {isActive
            ? t("スキップ🪙1で別の曲にできます。")
            : t("出題者がスキップするまでお待ちください。")}
        </div>
      )}
    </div>
  );
}
