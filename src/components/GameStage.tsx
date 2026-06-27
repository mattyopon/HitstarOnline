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
        {/* Countdown is shown large over the record below; reveal plays in full. */}
        {phase === "reveal" &&
          (playVideoId ? (
            <span className="pill">🎶 {t("フル再生中")}</span>
          ) : (
            <span className="pill">{t("音源を取得できませんでした")}</span>
          ))}
      </div>
      <div className="row" style={{ justifyContent: "center", position: "relative" }}>
        <YouTubePlayer
          videoId={playVideoId}
          startSeconds={startSeconds}
          playing={playing}
          reveal={revealMode}
          volume={volume}
          onUnavailable={onUnavailable}
        />
        {/* Big remaining-seconds overlay on top of the record (placing/stealing). */}
        {(phase === "placing" || phase === "stealing") && countdownEl && (
          <div className="yt-countdown" aria-hidden="true">
            {countdownEl}
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center", justifyContent: "center" }}>
        <span className="tiny muted">{t("🔊 曲の音量")}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          style={{ width: 160 }}
          aria-label={t("曲の音量")}
        />
        <span className="tiny muted" style={{ width: 32, textAlign: "right" }}>
          {volume}
        </span>
      </div>
      {((phase === "placing" && (trackUnavailable || !playVideoId)) ||
        (phase === "stealing" && trackUnavailable)) && (
        <div className="notice tiny" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
          ⚠️ {t("この曲は再生できないようです。")} {t("この曲をスキップ")}
        </div>
      )}
    </div>
  );
}
