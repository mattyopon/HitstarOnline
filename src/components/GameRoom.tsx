"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/hooks/useRoom";
import { useServerNow } from "@/hooks/useServerNow";
import { serverNow } from "@/lib/serverClock";
import { useGoogleToken } from "@/hooks/useGoogleToken";
import { api } from "@/lib/clientApi";
import { Timeline } from "./Timeline";
import { PlayerList } from "./PlayerList";
import { RevealCard } from "./RevealCard";
import { ChatDock } from "./ChatDock";
import { VoicePanel } from "./VoicePanel";
import { SettingsPanel } from "./SettingsPanel";
import { SoundGate } from "./SoundGate";
import { GameHeader } from "./GameHeader";
import { GameStage } from "./GameStage";
import { PlacementPanel } from "./PlacementPanel";
import { StealPanel } from "./StealPanel";
import { GameOverBanner } from "./GameOverBanner";
import { LobbyWaitingCard } from "./LobbyWaitingCard";
import { DEFAULT_SETTINGS, type PublicState } from "@/lib/protocol";
import { voiceEnabled } from "@/lib/voice";
import { playRankEntrySound } from "@/lib/rankSound";
import { useT } from "@/lib/i18n";

export function GameRoom({ code, meId }: { code: string; meId: string }) {
  const t = useT();
  const router = useRouter();
  const { state, error, apply } = useRoom(code, true);
  // Server-corrected clock: all timing is compared against server-authored
  // timestamps, so a skewed device clock here would silence the song / mis-time
  // the countdown for that device only (the 3-player "can't hear" bug).
  const now = useServerNow();
  const googleToken = useGoogleToken();

  const [soundOn, setSoundOn] = useState(false);
  const [ytVolume, setYtVolume] = useState<number>(() => {
    if (typeof window === "undefined") return 70;
    const v = Number(localStorage.getItem("hitstar_yt_volume"));
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 70;
  });
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [gTitle, setGTitle] = useState("");
  const [gArtist, setGArtist] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  // True if YouTube reports the current song can't be embedded/played here.
  const [trackUnavailable, setTrackUnavailable] = useState(false);
  // "横取りしない" preference (per player, persisted). Default OFF: opponents get
  // the full steal window to react. Opt-in ON makes you auto-pass for fast games.
  const [dontSteal, setDontSteal] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const v = localStorage.getItem("hitstar_dont_steal");
    return v == null ? false : v === "true";
  });
  const [showSettings, setShowSettings] = useState(false);
  // Fire-once guards (keyed by round) for auto steal-pass and listen-end nudge.
  const autoPassedRound = useRef<number | null>(null);
  const listenEndNudgedRound = useRef<number | null>(null);
  const autoSkipCardRef = useRef<string | null>(null);
  const entrySePlayed = useRef(false);

  const phase = state?.phase;
  const round = state?.round;
  const activeIndex = state?.activeIndex;
  const version = state?.version;

  // Reset per-turn UI when the turn/phase changes.
  useEffect(() => {
    setSelectedSlot(null);
    setGTitle("");
    setGArtist("");
    setActionErr(null);
    setTrackUnavailable(false);
  }, [phase, activeIndex, round]);

  // Auto-advance timed-out phases (host first, others as fallback).
  useEffect(() => {
    if (!state || !state.deadline) return;
    if (state.phase === "lobby" || state.phase === "gameover") return;
    const amHost = state.hostId === meId;
    const delay = Math.max(0, state.deadline - serverNow()) + (amHost ? 300 : 2800);
    const t = setTimeout(() => {
      api<{ state?: PublicState }>("/api/game/advance", { code })
        .then((r) => r.state && apply(r.state))
        .catch(() => {});
    }, delay);
    return () => clearTimeout(t);
  }, [version, state, meId, code, apply]);

  // Bot heartbeat: while it's an NPC's turn, nudge the server to step the bot
  // promptly (foreground). Backgrounded tabs fall back to the server cron.
  useEffect(() => {
    if (!state) return;
    const activeId = state.order[state.activeIndex];
    const botPlacing =
      state.phase === "placing" && !!state.players.find((p) => p.userId === activeId)?.isBot;
    const botStealing =
      state.phase === "stealing" &&
      state.players.some(
        (p) =>
          p.isBot &&
          p.connected &&
          p.tokens > 0 &&
          p.userId !== activeId &&
          !state.steals.some((s) => s.userId === p.userId),
      );
    if (!botPlacing && !botStealing) return;
    const iv = setInterval(() => {
      api<{ state?: PublicState }>("/api/game/advance", { code })
        .then((r) => r.state && apply(r.state))
        .catch(() => {});
    }, 1300);
    return () => clearInterval(iv);
  }, [version, state, code, apply]);

  // Active player nudges the server at the listening-window end so the music
  // stops promptly (advance marks listeningEndedAt) even if they don't submit.
  useEffect(() => {
    if (!state || state.phase !== "placing") return;
    if (state.order[state.activeIndex] !== meId) return;
    if (state.listeningEndedAt != null) return;
    if (listenEndNudgedRound.current === state.round) return;
    const start = state.listenStartedAt ?? state.current?.startedAt ?? 0;
    const dur =
      state.listenDurationMs ?? (state.settings.listenSeconds ?? DEFAULT_SETTINGS.listenSeconds) * 1000;
    const round = state.round;
    const delay = Math.max(0, start + dur - serverNow()) + 200;
    const t = setTimeout(() => {
      listenEndNudgedRound.current = round;
      api<{ state?: PublicState }>("/api/game/advance", { code })
        .then((r) => r.state && apply(r.state))
        .catch(() => {});
    }, delay);
    return () => clearTimeout(t);
  }, [version, state, meId, code, apply]);

  // Auto-pass the steal decision when the player has "横取りしない" enabled,
  // so the steal phase can end without waiting the full 10s. Fires once/round.
  useEffect(() => {
    if (!state || state.phase !== "stealing" || !dontSteal) return;
    if (state.order[state.activeIndex] === meId) return;
    const meNow = state.players.find((p) => p.userId === meId);
    if (!meNow || meNow.tokens <= 0) return;
    if (state.steals.some((s) => s.userId === meId)) return;
    if (state.stealerDecisions?.[meId]) return;
    if (autoPassedRound.current === state.round) return;
    autoPassedRound.current = state.round;
    api<{ state?: PublicState }>("/api/game/steal-pass", { code })
      .then((r) => r.state && apply(r.state))
      .catch(() => {
        autoPassedRound.current = null;
      });
  }, [version, state, meId, code, dontSteal, apply]);

  // If the current song can't be played for THIS participant — YouTube reports it
  // unavailable, or there's no resolvable source at all (youtubeId is null) — report
  // it so the room moves on to the next song ("参加者のうち誰か聞けない場合は次の曲").
  // Works in every room (not just solo); the cardId guard + server cardId guard make
  // concurrent reports skip the card exactly once. reason:"unavailable" lets the
  // server drop the bad cached id so the song can re-resolve later.
  useEffect(() => {
    if (!state || state.phase !== "placing") return;
    const cardId = state.current?.cardId;
    if (!cardId) return;
    const unplayable = trackUnavailable || !state.current?.youtubeId;
    if (!unplayable || autoSkipCardRef.current === cardId) return;
    autoSkipCardRef.current = cardId;
    api<{ state?: PublicState }>("/api/game/skip-song", { code, cardId, reason: "unavailable" })
      .then((r) => r.state && apply(r.state))
      .catch(() => {
        autoSkipCardRef.current = null;
      });
  }, [trackUnavailable, state, code, apply]);

  // Ranked entry fanfare: play the local player's rank SE once, after the sound
  // gate unlocks (reuses the existing tap gate; no extra gesture listener).
  useEffect(() => {
    if (!soundOn || !state || entrySePlayed.current) return;
    if (!state.settings.ranked) return;
    const meTier = state.players.find((p) => p.userId === meId)?.tier;
    if (meTier) {
      entrySePlayed.current = true;
      playRankEntrySound(meTier);
    }
  }, [soundOn, state, meId]);

  // Best-effort leave when the tab closes.
  useEffect(() => {
    const onLeave = () => {
      try {
        navigator.sendBeacon?.(
          "/api/room/leave",
          new Blob([JSON.stringify({ code })], { type: "application/json" }),
        );
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [code]);

  // Reconnect recovery: a backgrounded tab or dropped network may have left us
  // marked disconnected and missing Realtime updates. On regaining focus or
  // connectivity, re-join (idempotent) to flip our connected flag back on and
  // resync the latest state — so refreshing or coming back returns you in-game.
  useEffect(() => {
    const rejoin = () => {
      if (document.visibilityState !== "visible") return;
      const name =
        (typeof window !== "undefined" && localStorage.getItem("hitstar_name")) || "";
      api<{ state?: PublicState }>("/api/room/join", { code, name })
        .then((r) => r.state && apply(r.state))
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", rejoin);
    window.addEventListener("online", rejoin);
    return () => {
      document.removeEventListener("visibilitychange", rejoin);
      window.removeEventListener("online", rejoin);
    };
  }, [code, apply]);

  async function act(path: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setActionErr(null);
    try {
      // Apply the server's returned state immediately so the acting player sees
      // their move without waiting for the Realtime round-trip.
      const res = await api<{ ok?: boolean; state?: PublicState }>(path, { code, ...body });
      if (res.state) apply(res.state);
      return true;
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : t("操作に失敗しました"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function forgetLastRoom() {
    try {
      localStorage.removeItem("hitstar_last_room");
    } catch {
      /* ignore */
    }
  }

  async function leave() {
    forgetLastRoom();
    await api("/api/room/leave", { code }).catch(() => {});
    router.push("/");
  }

  function goHome() {
    forgetLastRoom();
    router.push("/");
  }

  function onVolumeChange(v: number) {
    setYtVolume(v);
    try {
      localStorage.setItem("hitstar_yt_volume", String(v));
    } catch {
      /* ignore */
    }
  }

  if (error && !state) {
    return (
      <div className="center-screen">
        <div className="card stack" style={{ maxWidth: 420, textAlign: "center" }}>
          <h2>{t("接続できませんでした")}</h2>
          <p className="muted">{error}</p>
          <button className="btn" onClick={() => router.push("/")}>
            {t("ホームに戻る")}
          </button>
        </div>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="center-screen">
        <span className="spin-loader" />
      </div>
    );
  }

  const me = state.players.find((p) => p.userId === meId);
  // Chat/danmaku/voice only make sense with other humans → multiplayer (no bots).
  const isMultiplayer = !state.players.some((p) => p.isBot);
  const showVoice = isMultiplayer && voiceEnabled();
  const activeId = state.order[state.activeIndex];
  const activePlayer = state.players.find((p) => p.userId === activeId);
  const isActive = activeId === meId;
  const inGame = state.phase !== "lobby";
  const revealMode = state.phase === "reveal" || state.phase === "gameover";

  // Listening / placement sub-phase timing (derived from state + now).
  const listenStart = state.listenStartedAt ?? state.current?.startedAt ?? 0;
  const listenDur =
    state.listenDurationMs ?? (state.settings.listenSeconds ?? DEFAULT_SETTINGS.listenSeconds) * 1000;
  const listenEndAt = listenStart + listenDur;
  // Small grace so residual clock jitter at the boundary can't briefly silence
  // the song; the server still authoritatively ends listening via listeningEndedAt.
  const LISTEN_GRACE_MS = 1200;
  const isListening =
    state.phase === "placing" &&
    state.listeningEndedAt == null &&
    now < listenEndAt + LISTEN_GRACE_MS;
  const earlyCutoff = listenStart + (state.settings.earlyBonusMs ?? 10000);
  const inEarlyWindow = state.phase === "placing" && now <= earlyCutoff;
  // While still listening (incl. the grace window) never show 0s — audio is
  // audibly playing, so a "0s" countdown would look like a stall.
  const listenLeft = isListening
    ? Math.max(1, Math.ceil((listenEndAt - now) / 1000))
    : Math.max(0, Math.ceil((listenEndAt - now) / 1000));
  const earlyLeft = Math.max(0, Math.ceil((earlyCutoff - now) / 1000));

  const playVideoId = revealMode
    ? state.reveal?.youtubeId ?? null
    : state.current?.youtubeId ?? null;
  // Music plays only while the song is "on": the listening window, or at reveal.
  const playing = soundOn && !!playVideoId && (isListening || state.phase === "reveal");

  const secondsLeft = state.deadline
    ? Math.max(0, Math.ceil((state.deadline - now) / 1000))
    : null;

  const alreadyStole = state.steals.some((s) => s.userId === meId);
  const myStealDecided = alreadyStole || !!state.stealerDecisions?.[meId];
  const canBuy = !!me && isActive && me.tokens >= state.settings.buyCost;
  const canSkip = !!me && isActive && state.settings.allowSkip && me.tokens > 0;
  const canExtend =
    !!me &&
    isActive &&
    isListening &&
    (state.settings.allowExtend ?? true) &&
    !state.listeningExtended &&
    me.tokens >= (state.settings.extendCost ?? 1);

  const settingsModal = showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />;
  const headerEl = (
    <GameHeader
      code={state.code}
      round={state.round}
      deckRemaining={state.deckRemaining}
      inGame={inGame}
      onSettings={() => setShowSettings(true)}
      onLeave={leave}
    />
  );

  // ── Lobby ──────────────────────────────────────────────────────────────────
  if (state.phase === "lobby") {
    return (
      <div className="container">
        {!soundOn && <SoundGate onEnable={() => setSoundOn(true)} />}
        {settingsModal}
        {headerEl}
        <div className="grid-2">
          <LobbyWaitingCard
            state={state}
            isHost={state.hostId === meId}
            busy={busy}
            actionErr={actionErr}
            onStart={() => act("/api/game/start", {})}
          />
          <div className="stack">
            <PlayerList state={state} meId={meId} />
            {showVoice && <VoicePanel code={code} players={state.players} />}
          </div>
        </div>
        {isMultiplayer && <ChatDock code={code} players={state.players} />}
      </div>
    );
  }

  // ── In-game ────────────────────────────────────────────────────────────────
  const cdValue = isListening ? listenLeft : secondsLeft;
  const cdIcon = isListening ? "🎧" : "⏳";
  const countdownEl = cdValue !== null && (
    <div className={"countdown" + (cdValue <= 5 ? " urgent" : "")}>
      {cdIcon} {cdValue}s
    </div>
  );

  return (
    <div className="container">
      {!soundOn && <SoundGate onEnable={() => setSoundOn(true)} />}
      {settingsModal}
      {headerEl}
      {actionErr && (
        <div className="error" style={{ marginBottom: 12 }}>
          {actionErr}
        </div>
      )}
      <div className="grid-2">
        <div className="stack">
          <GameStage
            phase={state.phase}
            isActive={isActive}
            isListening={isListening}
            activeName={activePlayer?.name ?? ""}
            playVideoId={playVideoId}
            playing={playing}
            startSeconds={state.settings.startSeconds}
            volume={ytVolume}
            onVolumeChange={onVolumeChange}
            revealMode={revealMode}
            trackUnavailable={trackUnavailable}
            onUnavailable={() => setTrackUnavailable(true)}
            countdownEl={countdownEl}
          />

          {/* Free skip — open to ANY participant during placing (no token cost),
              separate from the token skip. Lets anyone move past a song they
              can't hear / don't want. */}
          {state.phase === "placing" && state.current && (
            <button
              className="btn ghost block"
              disabled={busy}
              onClick={() => act("/api/game/skip-song", { cardId: state.current?.cardId })}
            >
              ⏭ {t("この曲をスキップ")}
            </button>
          )}

          {revealMode && <RevealCard state={state} googleToken={googleToken} />}

          {/* Skip the reveal — the song plays in full, so anyone can move on. */}
          {state.phase === "reveal" && (
            <button className="btn block" disabled={busy} onClick={() => act("/api/game/next", {})}>
              ▶ {t("次の曲へ")}
            </button>
          )}

          {state.phase === "gameover" && (
            <GameOverBanner players={state.players} winnerId={state.winnerId} onHome={goHome} />
          )}

          {/* Active player's placement controls */}
          {state.phase === "placing" && isActive && me && (
            <PlacementPanel
              settings={state.settings}
              me={me}
              isListening={isListening}
              inEarlyWindow={inEarlyWindow}
              earlyLeft={earlyLeft}
              selectedSlot={selectedSlot}
              setSelectedSlot={setSelectedSlot}
              gTitle={gTitle}
              setGTitle={setGTitle}
              gArtist={gArtist}
              setGArtist={setGArtist}
              busy={busy}
              canExtend={canExtend}
              canSkip={canSkip}
              canBuy={canBuy}
              listeningExtended={!!state.listeningExtended}
              act={act}
            />
          )}

          {/* Non-active waiting during placing */}
          {state.phase === "placing" && !isActive && (
            <div className="card stack">
              <div className="muted">
                {isListening
                  ? t("🎧 {name} が試聴中… 一緒に聞こう（{s}s）", {
                      name: activePlayer?.name ?? "",
                      s: listenLeft,
                    })
                  : t("{name} が配置中… 配置されたら横取りのチャンス！", {
                      name: activePlayer?.name ?? "",
                    })}
              </div>
              {me && <Timeline cards={me.timeline} compact />}
            </div>
          )}

          {/* Stealing */}
          {state.phase === "stealing" && (
            <StealPanel
              me={me}
              isActive={isActive}
              activePlayer={activePlayer}
              placementSlot={state.placement?.slotIndex ?? null}
              selectedSlot={selectedSlot}
              setSelectedSlot={setSelectedSlot}
              dontSteal={dontSteal}
              setDontSteal={setDontSteal}
              myStealDecided={myStealDecided}
              secondsLeft={secondsLeft}
              busy={busy}
              act={act}
            />
          )}

          {/* Your timeline reference during reveal */}
          {revealMode && me && state.phase === "reveal" && (
            <div className="card stack">
              <div className="tiny muted">{t("あなたの年表")}</div>
              <Timeline cards={me.timeline} compact />
            </div>
          )}
        </div>

        <div className="stack">
          <PlayerList state={state} meId={meId} />
          {showVoice && <VoicePanel code={code} players={state.players} />}
          {me && (
            <div className="card stack" style={{ padding: 14 }}>
              <div className="row spread">
                <span className="muted tiny">{t("あなたの持ちトークン")}</span>
                <span className="token">🪙 {me.tokens}</span>
              </div>
              <div className="bar">
                <div
                  style={{
                    width: `${Math.min(100, (Math.max(0, me.timeline.length - 1) / state.settings.targetCards) * 100)}%`,
                  }}
                />
              </div>
              <div className="tiny muted">
                {t("獲得カード {n} / {total}", {
                  n: Math.max(0, me.timeline.length - 1),
                  total: state.settings.targetCards,
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {isMultiplayer && <ChatDock code={code} players={state.players} />}
    </div>
  );
}
