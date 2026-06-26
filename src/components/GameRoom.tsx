"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/hooks/useRoom";
import { useNow } from "@/hooks/useNow";
import { api } from "@/lib/clientApi";
import { Timeline } from "./Timeline";
import { PlayerList } from "./PlayerList";
import { RevealCard } from "./RevealCard";
import { YouTubePlayer } from "./YouTubePlayer";

export function GameRoom({ code, meId }: { code: string; meId: string }) {
  const router = useRouter();
  const { state, error } = useRoom(code, true);
  const now = useNow();

  const [soundOn, setSoundOn] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [gTitle, setGTitle] = useState("");
  const [gArtist, setGArtist] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

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
      api("/api/game/advance", { code }).catch(() => {});
    }, delay);
    return () => clearTimeout(t);
  }, [version, state, meId, code]);

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
      await api(path, { code, ...body });
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

  if (error) {
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
  const activeId = state.order[state.activeIndex];
  const activePlayer = state.players.find((p) => p.userId === activeId);
  const isActive = activeId === meId;
  const inGame = state.phase !== "lobby";
  const revealMode = state.phase === "reveal" || state.phase === "gameover";

  const playVideoId = revealMode
    ? state.reveal?.youtubeId ?? null
    : state.current?.youtubeId ?? null;
  const playing =
    soundOn &&
    (state.phase === "placing" || state.phase === "stealing" || state.phase === "reveal") &&
    !!playVideoId;

  const secondsLeft = state.deadline
    ? Math.max(0, Math.ceil((state.deadline - now) / 1000))
    : null;

  const alreadyStole = state.steals.some((s) => s.userId === meId);
  const canSteal = !!me && me.tokens > 0 && !isActive && !alreadyStole;
  const canBuy = !!me && isActive && me.tokens >= state.settings.buyCost;
  const canSkip = !!me && isActive && state.settings.allowSkip && me.tokens > 0;

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
        <button className="btn ghost tiny" onClick={leave}>
          退出
        </button>
      </div>
    </div>
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
          <PlayerList state={state} meId={meId} />
        </div>
      </div>
    );
  }

  // ── In-game ────────────────────────────────────────────────────────────────
  const countdownEl = secondsLeft !== null && (
    <div className={"countdown" + (secondsLeft <= 5 ? " urgent" : "")}>⏳ {secondsLeft}s</div>
  );

  const stage = (
    <div className="card stack">
      <div className="row spread">
        <strong>
          {state.phase === "placing" && (isActive ? "あなたの番です！" : `${activePlayer?.name} の番`)}
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
        />
      </div>
    </div>
  );

  return (
    <div className="container">
      {soundGate}
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
          {revealMode && <RevealCard state={state} />}

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
              <strong>年表の正しい位置を選ぼう</strong>
              <Timeline
                cards={me.timeline}
                interactive
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
                  ここに置く
                </button>
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
              </div>
            </div>
          )}

          {/* Non-active waiting during placing */}
          {state.phase === "placing" && !isActive && (
            <div className="card stack">
              <div className="muted">{activePlayer?.name} が考え中… 配置されたら横取りのチャンス！</div>
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
              {isActive ? (
                <div className="notice">相手の横取りを待っています…</div>
              ) : alreadyStole ? (
                <div className="notice">横取り済み！結果を待っています</div>
              ) : canSteal && me ? (
                <>
                  <strong>違うと思う？自分の年表の正しい位置に置いて横取り！（🪙1）</strong>
                  <Timeline
                    cards={me.timeline}
                    interactive
                    selectedSlot={selectedSlot}
                    onSelect={setSelectedSlot}
                  />
                  <button
                    className="btn"
                    disabled={busy || selectedSlot === null}
                    onClick={() => act("/api/game/steal", { slotIndex: selectedSlot })}
                  >
                    横取りする 🪙1
                  </button>
                </>
              ) : (
                <div className="muted">トークンがないため横取りできません。</div>
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
    </div>
  );
}

function modeLabel(mode: string): string {
  if (mode === "pro") return "プロ";
  if (mode === "expert") return "エキスパート";
  return "オリジナル";
}
