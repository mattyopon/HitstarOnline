"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/hooks/useRoom";
import { useNow } from "@/hooks/useNow";
import { useGoogleToken } from "@/hooks/useGoogleToken";
import { api } from "@/lib/clientApi";
import { Timeline } from "./Timeline";
import { PlacementArea } from "./PlacementArea";
import { PlayerList } from "./PlayerList";
import { RevealCard } from "./RevealCard";
import { YouTubePlayer } from "./YouTubePlayer";
import { ChatDock } from "./ChatDock";
import { VoicePanel } from "./VoicePanel";
import { SettingsPanel } from "./SettingsPanel";
import { CATEGORIES } from "@/lib/protocol";
import type { PublicState } from "@/lib/protocol";
import { voiceEnabled } from "@/lib/voice";
import { playRankEntrySound } from "@/lib/rankSound";

export function GameRoom({ code, meId }: { code: string; meId: string }) {
  const router = useRouter();
  const { state, error, apply } = useRoom(code, true);
  const now = useNow();
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
  // "横取りしない" preference (per player, persisted). Default ON → auto-pass.
  const [dontSteal, setDontSteal] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem("hitstar_dont_steal");
    return v == null ? true : v === "true";
  });
  const [showSettings, setShowSettings] = useState(false);
  // Fire-once guards (keyed by round) for auto steal-pass and listen-end nudge.
  const autoPassedRound = useRef<number | null>(null);
  const listenEndNudgedRound = useRef<number | null>(null);
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
  }, [phase, activeIndex, round]);

  // Auto-advance timed-out phases (host first, others as fallback).
  useEffect(() => {
    if (!state || !state.deadline) return;
    if (state.phase === "lobby" || state.phase === "gameover") return;
    const amHost = state.hostId === meId;
    const delay = Math.max(0, state.deadline - Date.now()) + (amHost ? 300 : 2800);
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
    const dur = state.listenDurationMs ?? (state.settings.listenSeconds ?? 30) * 1000;
    const round = state.round;
    const delay = Math.max(0, start + dur - Date.now()) + 200;
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

  async function act(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setActionErr(null);
    try {
      // Apply the server's returned state immediately so the acting player sees
      // their move without waiting for the Realtime round-trip.
      const res = await api<{ ok?: boolean; state?: PublicState }>(path, { code, ...body });
      if (res.state) apply(res.state);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    await api("/api/room/leave", { code }).catch(() => {});
    router.push("/");
  }

  if (error && !state) {
    return (
      <div className="center-screen">
        <div className="card stack" style={{ maxWidth: 420, textAlign: "center" }}>
          <h2>接続できませんでした</h2>
          <p className="muted">{error}</p>
          <button className="btn" onClick={() => router.push("/")}>
            ホームに戻る
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
  const listenDur = state.listenDurationMs ?? (state.settings.listenSeconds ?? 30) * 1000;
  const listenEndAt = listenStart + listenDur;
  const isListening =
    state.phase === "placing" && state.listeningEndedAt == null && now < listenEndAt;
  const earlyCutoff = listenStart + (state.settings.earlyBonusMs ?? 10000);
  const inEarlyWindow = state.phase === "placing" && now <= earlyCutoff;
  const listenLeft = Math.max(0, Math.ceil((listenEndAt - now) / 1000));
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

  // ── Header ────────────────────────────────────────────────────────────────
  const header = (
    <div className="row spread" style={{ marginBottom: 16 }}>
      <div className="brand" style={{ gap: 8 }}>
        <div className="logo" style={{ width: 32, height: 32 }} />
        <h1 style={{ fontSize: 18 }}>Hitstar Online</h1>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <span className="pill">部屋 <strong style={{ letterSpacing: 2 }}>{state.code}</strong></span>
        {inGame && <span className="pill">第{state.round}ターン</span>}
        {inGame && <span className="pill">残り{state.deckRemaining}曲</span>}
        <button className="btn ghost tiny" onClick={() => setShowSettings(true)} title="設定">
          ⚙️
        </button>
        <button className="btn ghost tiny" onClick={leave}>
          退出
        </button>
      </div>
    </div>
  );

  const settingsModal = showSettings && (
    <SettingsPanel onClose={() => setShowSettings(false)} />
  );

  // ── Sound unlock overlay ───────────────────────────────────────────────────
  const soundGate =
    inGame && !soundOn ? (
      <div className="tap-overlay" onClick={() => setSoundOn(true)}>
        <div className="card stack" style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 44 }}>🔊</div>
          <h2 style={{ margin: 0 }}>タップして開始</h2>
          <p className="muted" style={{ margin: 0 }}>
            音楽を再生するために一度タップしてください。
          </p>
          <button className="btn block">サウンドを有効にする</button>
        </div>
      </div>
    ) : null;

  // ── Lobby ──────────────────────────────────────────────────────────────────
  if (state.phase === "lobby") {
    const isHost = state.hostId === meId;
    return (
      <div className="container">
        {settingsModal}
        {header}
        <div className="grid-2">
          <div className="card stack">
            <h2 style={{ marginTop: 0 }}>友達を待っています…</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              下のコードを友達に伝えてください。同じコードで参加すると一緒に遊べます。
            </p>
            <div className="row" style={{ justifyContent: "center", gap: 14 }}>
              <span className="code-pill">{state.code}</span>
              <button
                className="btn secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(state.code);
                }}
              >
                コピー
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  const url = `${location.origin}/room/${state.code}`;
                  navigator.clipboard?.writeText(url);
                }}
              >
                招待リンク
              </button>
            </div>
            <div className="notice tiny">
              ルール: {modeLabel(state.settings.mode)} ／ {state.settings.targetCards}枚で勝利 ／
              開始トークン{state.settings.startingTokens}
              <br />
              カテゴリ: {catLabels(state.settings.categories)}
            </div>
            {actionErr && <div className="error">{actionErr}</div>}
            {isHost ? (
              <button
                className="btn block"
                disabled={busy || state.players.length < 2}
                onClick={() => act("/api/game/start", {})}
              >
                {state.players.length < 2 ? "2人以上で開始できます" : "🎶 ゲーム開始"}
              </button>
            ) : (
              <div className="notice">ホストの開始を待っています…</div>
            )}
          </div>
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

  const stage = (
    <div className="card stack">
      <div className="row spread">
        <strong>
          {state.phase === "placing" &&
            isListening &&
            (isActive ? "🎧 試聴中（聞いて配置）" : `🎧 ${activePlayer?.name} が試聴中`)}
          {state.phase === "placing" &&
            !isListening &&
            (isActive ? "⏳ 配置してOK！" : `⏳ ${activePlayer?.name} が配置中`)}
          {state.phase === "stealing" && "横取りチャンス！"}
          {state.phase === "reveal" && "結果発表"}
          {state.phase === "gameover" && "ゲーム終了"}
        </strong>
        {state.phase !== "gameover" && countdownEl}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <YouTubePlayer
          videoId={playVideoId}
          startSeconds={state.settings.startSeconds}
          playing={playing}
          reveal={revealMode}
          volume={ytVolume}
        />
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center", justifyContent: "center" }}>
        <span className="tiny muted">🔊 曲の音量</span>
        <input
          type="range"
          min={0}
          max={100}
          value={ytVolume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setYtVolume(v);
            try {
              localStorage.setItem("hitstar_yt_volume", String(v));
            } catch {
              /* ignore */
            }
          }}
          style={{ width: 160 }}
          aria-label="曲の音量"
        />
        <span className="tiny muted" style={{ width: 32, textAlign: "right" }}>{ytVolume}</span>
      </div>
    </div>
  );

  return (
    <div className="container">
      {soundGate}
      {settingsModal}
      {header}
      {actionErr && (
        <div className="error" style={{ marginBottom: 12 }}>
          {actionErr}
        </div>
      )}
      <div className="grid-2">
        <div className="stack">
          {stage}

          {/* Reveal */}
          {revealMode && <RevealCard state={state} googleToken={googleToken} />}

          {/* Game over */}
          {state.phase === "gameover" && (
            <div className="card big-banner stack">
              <div className="trophy">🏆</div>
              <h2 style={{ margin: 0 }}>
                {state.players.find((p) => p.userId === state.winnerId)?.name ?? "?"} の勝ち！
              </h2>
              <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                {[...state.players]
                  .sort((a, b) => b.timeline.length - a.timeline.length || b.tokens - a.tokens)
                  .map((p, i) => (
                    <div key={p.userId} className="row spread">
                      <span>
                        {i + 1}位 {p.name}
                      </span>
                      <span className="muted">
                        🃏 {Math.max(0, p.timeline.length - 1)} ／ 🪙 {p.tokens}
                      </span>
                    </div>
                  ))}
              </div>
              <button className="btn block" onClick={() => router.push("/")}>
                ホームに戻る
              </button>
            </div>
          )}

          {/* Active player's placement controls */}
          {state.phase === "placing" && isActive && me && (
            <div className="card stack fade-in">
              <div className="row spread" style={{ alignItems: "center" }}>
                <strong>
                  {isListening
                    ? "🎧 曲を聞いて配置しよう"
                    : `⏳ ${state.settings.placementSeconds ?? 30}秒以内に配置してOK！`}
                </strong>
                {inEarlyWindow && (
                  <span
                    className="pill"
                    style={{ borderColor: "var(--gold)", color: "var(--gold)" }}
                    title="開始10秒以内に正解配置でトークン2枚"
                  >
                    ⚡早置き +{state.settings.earlyBonusTokens ?? 2}🪙 あと{earlyLeft}s
                  </span>
                )}
              </div>
              <PlacementArea
                cards={me.timeline}
                selectedSlot={selectedSlot}
                onSelect={setSelectedSlot}
              />
              <div className="row wrap" style={{ gap: 10 }}>
                <input
                  type="text"
                  placeholder="曲名（任意・当てるとトークン）"
                  value={gTitle}
                  onChange={(e) => setGTitle(e.target.value)}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <input
                  type="text"
                  placeholder="アーティスト名（任意）"
                  value={gArtist}
                  onChange={(e) => setGArtist(e.target.value)}
                  style={{ flex: 1, minWidth: 160 }}
                />
              </div>
              <div className="row wrap">
                <button
                  className="btn"
                  disabled={busy || selectedSlot === null}
                  onClick={() =>
                    act("/api/game/place", {
                      slotIndex: selectedSlot,
                      guess: { title: gTitle, artist: gArtist },
                    })
                  }
                >
                  ✅ 提出（OK）
                </button>
                {canExtend && (
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => act("/api/game/extend", {})}
                    title={`トークン${state.settings.extendCost ?? 1}枚で試聴を${state.settings.extendSeconds ?? 60}秒延長（1回のみ）`}
                  >
                    ⏱ 延長 +{state.settings.extendSeconds ?? 60}s 🪙{state.settings.extendCost ?? 1}
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
                  title={`トークン${state.settings.buyCost}枚で自動的に正しい位置へ`}
                >
                  購入 🪙{state.settings.buyCost}
                </button>
              </div>
              <div className="tiny muted">
                あなたのトークン: <span className="token">🪙 {me.tokens}</span>
                {state.listeningExtended && <span className="muted">　（延長済み）</span>}
              </div>
            </div>
          )}

          {/* Non-active waiting during placing */}
          {state.phase === "placing" && !isActive && (
            <div className="card stack">
              <div className="muted">
                {isListening
                  ? `🎧 ${activePlayer?.name} が試聴中… 一緒に聞こう（${listenLeft}s）`
                  : `${activePlayer?.name} が配置中… 配置されたら横取りのチャンス！`}
              </div>
              {me && <Timeline cards={me.timeline} compact />}
            </div>
          )}

          {/* Stealing */}
          {state.phase === "stealing" && (
            <div className="card stack fade-in">
              <strong>{activePlayer?.name} の配置はここ 👇</strong>
              {activePlayer && (
                <Timeline cards={activePlayer.timeline} mysterySlot={state.placement?.slotIndex ?? null} compact />
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
                  <span className="tiny">横取りしない（ONなら自動でパス）</span>
                </label>
              )}
              {isActive ? (
                <div className="notice">相手の判断を待っています…（{secondsLeft}s）</div>
              ) : myStealDecided ? (
                <div className="notice">決定済み！結果を待っています</div>
              ) : !me || me.tokens <= 0 ? (
                <div className="muted">トークンがないため横取りできません。</div>
              ) : dontSteal ? (
                <div className="notice">「横取りしない」設定のためスキップします…</div>
              ) : (
                <>
                  <strong>違うと思う？正しい位置に置いて横取り！（🪙1・あと{secondsLeft}s）</strong>
                  <PlacementArea
                    cards={me.timeline}
                    selectedSlot={selectedSlot}
                    onSelect={setSelectedSlot}
                    hint="違うと思う位置にタイルをドラッグ（タップでもOK）"
                  />
                  <div className="row wrap">
                    <button
                      className="btn"
                      disabled={busy || selectedSlot === null}
                      onClick={() => act("/api/game/steal", { slotIndex: selectedSlot })}
                    >
                      横取りする 🪙1
                    </button>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => act("/api/game/steal-pass", {})}
                    >
                      パス
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Your timeline reference during reveal */}
          {revealMode && me && state.phase === "reveal" && (
            <div className="card stack">
              <div className="tiny muted">あなたの年表</div>
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
                <span className="muted tiny">あなたの持ちトークン</span>
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
                獲得カード {Math.max(0, me.timeline.length - 1)} / {state.settings.targetCards}
              </div>
            </div>
          )}
        </div>
      </div>
      {isMultiplayer && <ChatDock code={code} players={state.players} />}
    </div>
  );
}

function modeLabel(mode: string): string {
  if (mode === "pro") return "プロ";
  if (mode === "expert") return "エキスパート";
  return "オリジナル";
}

function catLabels(categories: string[]): string {
  if (!categories || categories.length === 0) return "全ジャンル";
  return categories
    .map((id) => CATEGORIES.find((c) => c.id === id)?.labelJa ?? id)
    .join("・");
}
