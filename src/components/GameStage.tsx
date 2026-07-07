"use client";

import type { ReactNode } from "react";
import type { Phase, Provider } from "@/lib/protocol";
import { YouTubePlayer } from "./YouTubePlayer";
import { BilibiliPlayer } from "./BilibiliPlayer";
import { GACHA_CHARS } from "@/lib/gachaChars";
import { useT } from "@/lib/i18n";

/** Character art for the picture-disc treatment (current-turn leader). */
export interface DiscArt {
  src: string;
  /** background-position style crop from gachaChars `focus`. */
  focus: string;
}

// Pick a purely-decorative muse to frame the vinyl. Deterministic from a seed
// string (the active player's name) so it stays stable within a turn and feels
// "assigned". FALLBACK ONLY: when the current-turn player's equipped leader is
// published (discArt), the picture-disc shows that instead.
function decoMuse(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return GACHA_CHARS[Math.abs(h) % GACHA_CHARS.length];
}

/** The "stage": phase title + countdown, the playback player (YouTube or
 *  Bilibili by provider), volume, and the unavailable-track notice. Pure
 *  presentation driven by props. */
export function GameStage({
  phase,
  isActive,
  isListening,
  activeName,
  provider,
  playVideoId,
  playing,
  startSeconds,
  listenStartMs,
  volume,
  onVolumeChange,
  revealMode,
  isCover,
  trackUnavailable,
  onUnavailable,
  countdownEl,
  discArt,
}: {
  phase: Phase;
  isActive: boolean;
  isListening: boolean;
  activeName: string;
  /** Playback provider for the current card (default "youtube"). */
  provider: Provider;
  /** The playable id for the active provider (YouTube video id OR bilibili BV). */
  playVideoId: string | null;
  playing: boolean;
  startSeconds: number;
  /** Server epoch-ms when listening began (0 = no drift-compensation, e.g.
   *  reveal). Forwarded to both players so late loaders seek into alignment. */
  listenStartMs: number;
  volume: number;
  onVolumeChange: (v: number) => void;
  revealMode: boolean;
  /** True for a cover (歌ってみた) card — show the "guess the original" hint. */
  isCover: boolean;
  trackUnavailable: boolean;
  onUnavailable: () => void;
  countdownEl: ReactNode;
  /** Current-turn player's leader art, printed ON the vinyl (picture disc).
   *  null/undefined = no gacha data → the generic vinyl art, unchanged. */
  discArt?: DiscArt | null;
}) {
  const t = useT();
  const phaseTitle =
    (phase === "placing" &&
      isListening &&
      (isActive ? t("🎧 試聴中（聞いて配置）") : t("🎧 {name} が試聴中", { name: activeName }))) ||
    (phase === "placing" &&
      !isListening &&
      (isActive ? t("⏳ 配置してOK！") : t("⏳ {name} が配置中", { name: activeName }))) ||
    (phase === "stealing" && t("横取りチャンス！")) ||
    (phase === "reveal" && t("結果発表")) ||
    (phase === "gameover" && t("ゲーム終了")) ||
    "";
  // During reveal the YouTube video is shown in full; otherwise the answer is
  // hidden behind the turntable visual while the song plays.
  const showCountdown = (phase === "placing" || phase === "stealing") && !!countdownEl;
  // Decorative half-body muse framing the vinyl (mock .vinyl-char). FALLBACK
  // path only (no published leader): purely cosmetic, derived from the active
  // player's name, never carries answer/game data.
  const muse = decoMuse(activeName || phaseTitle || "hitstar");
  return (
    <div className="card stack">
      <div className="turntable">
        {/* Decorative spinning record + tonearm (purely visual). When the
            current-turn leader is known, their art is printed ON the disc
            surface (picture disc): clipped to the circle, grooves/sheen over
            the art, center label on top, spinning as one piece. */}
        {!revealMode && (
          <div className="big-vinyl" aria-hidden="true">
            {discArt && (
              <div className="disc-face">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="pdisc-art"
                  src={discArt.src}
                  alt=""
                  style={{ objectPosition: discArt.focus }}
                />
                <span className="pdisc-grooves" />
                <span className="pdisc-label" />
              </div>
            )}
          </div>
        )}
        {/* No-leader fallback: muse rising behind the disc — framing only,
            aria-hidden. Hidden at reveal so the full player isn't obstructed.
            Never shown together with the picture disc (that was the owner
            complaint: a rectangular portrait behind the record). */}
        {!revealMode && !discArt && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="vinyl-char" src={muse.img} alt="" aria-hidden="true" />
        )}
        <div className="needle" aria-hidden="true" />

        {/* The playback iframe (YouTube or Bilibili by provider) — hidden behind
            the turntable while playing, shown full-size at reveal. */}
        <div
          className="row"
          style={{ justifyContent: "center", position: "relative", zIndex: 3 }}
        >
          {provider === "bilibili" ? (
            <BilibiliPlayer
              videoId={playVideoId}
              startSeconds={startSeconds}
              listenStartMs={listenStartMs}
              playing={playing}
              reveal={revealMode}
              volume={volume}
              onUnavailable={onUnavailable}
              discArt={discArt}
            />
          ) : (
            <YouTubePlayer
              videoId={playVideoId}
              startSeconds={startSeconds}
              listenStartMs={listenStartMs}
              playing={playing}
              reveal={revealMode}
              volume={volume}
              onUnavailable={onUnavailable}
              discArt={discArt}
            />
          )}
        </div>

        {/* Big remaining-seconds overlay centered over the record. */}
        {showCountdown && (
          <div className="countdown-over" aria-hidden="true">
            <div className="yt-countdown" style={{ position: "static" }}>
              {countdownEl}
            </div>
            <div className="sub">— Seconds Remaining —</div>
          </div>
        )}

        {/* Now-playing strip with the pulsing live dot. */}
        {!revealMode && phaseTitle && (
          <div className="now-meta">
            <span className="live-dot" aria-hidden="true" />
            <span>{phaseTitle}</span>
          </div>
        )}
        {/* Bilibili embeds honor the viewer's own bilibili.com session; some
            videos require login, so nudge (playback still auto-skips if not). */}
        {provider === "bilibili" && !revealMode && (
          <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>
            {t("Bilibiliにログインしておくと再生できる曲が増えます")}
          </div>
        )}
        {phase === "reveal" && (
          <div className="now-meta">
            <span className="live-dot" aria-hidden="true" />
            <span>
              {playVideoId ? t("フル再生中") : t("音源を取得できませんでした")}
            </span>
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
      {/* Cover (歌ってみた) hint: guess the ORIGINAL song's release year. */}
      {isCover && phase !== "reveal" && phase !== "gameover" && (
        <div className="notice tiny" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
          {t("🎤 これはカバー（歌ってみた）です。原曲の発売年を当ててね")}
        </div>
      )}
      {/* Bilibili may need region/login to play in some places. */}
      {provider === "bilibili" && phase !== "gameover" && (
        <div className="notice tiny muted">
          {t("Bilibiliの再生には地域/ログインが必要な場合があります")}
        </div>
      )}
      {((phase === "placing" && (trackUnavailable || !playVideoId)) ||
        (phase === "stealing" && trackUnavailable)) && (
        <div className="notice tiny" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
          ⚠️ {t("この曲は再生できないようです。")} {t("この曲をスキップ")}
        </div>
      )}
    </div>
  );
}
