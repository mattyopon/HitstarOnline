"use client";

import { useVoice } from "@/hooks/useVoice";
import { useUser } from "@/hooks/useUser";
import { Avatar } from "./Avatar";
import type { PublicPlayer } from "@/lib/protocol";

/**
 * In-room voice chat controls: join (mic or listen-only), mic mute toggle, and
 * a per-peer output volume slider with speaking/mute indicators. WebRTC audio
 * mesh; see useVoice. Mounted for multiplayer rooms only and behind the
 * NEXT_PUBLIC_VOICE_ENABLED flag.
 */
export function VoicePanel({ code, players }: { code: string; players: PublicPlayer[] }) {
  const { user } = useUser();
  const v = useVoice(code, user);

  const nameOf = (userId: string, fallback: string) =>
    players.find((p) => p.userId === userId)?.name ?? fallback;
  const avatarOf = (userId: string) => players.find((p) => p.userId === userId)?.avatarUrl ?? null;

  return (
    <div className="card stack voice-panel" style={{ padding: 14 }}>
      <div className="row spread">
        <strong>🎙️ ボイスチャット</strong>
        {v.joined && (
          <button className="btn ghost tiny" onClick={v.leave}>
            退室
          </button>
        )}
      </div>

      {v.error && <div className="error tiny">{v.error}</div>}

      {!v.joined ? (
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn block"
            disabled={v.connecting}
            onClick={() => v.join(false)}
          >
            {v.connecting ? "接続中…" : "🎤 マイクで参加"}
          </button>
          <button
            className="btn secondary"
            disabled={v.connecting}
            onClick={() => v.join(true)}
            title="マイクを使わず聞くだけで参加"
          >
            🎧 聞き専
          </button>
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <button
              className={"btn block" + (v.micOn ? "" : " secondary")}
              onClick={v.toggleMic}
            >
              {v.micOn ? "🎤 ミュートにする" : "🔇 ミュート中（タップで解除）"}
            </button>
            {v.micOn && (
              <span
                className={"speak-dot" + (v.speaking ? " on" : "")}
                title={v.speaking ? "発話中" : "マイクON"}
              />
            )}
          </div>

          <div className="stack" style={{ gap: 8 }}>
            {v.peers.length === 0 ? (
              <p className="tiny muted" style={{ margin: 0 }}>
                ほかに通話中の人がいません。
              </p>
            ) : (
              v.peers.map((p) => {
                const avatarUrl = avatarOf(p.userId);
                return (
                  <div key={p.userId} className="voice-peer">
                    <span className={"speak-dot" + (p.speaking ? " on" : "")} />
                    <Avatar name={nameOf(p.userId, p.name)} url={avatarUrl} size="sm" />
                    <span className="voice-name tiny">
                      {nameOf(p.userId, p.name)}
                      {p.muted && <span className="muted"> 🔇</span>}
                      {!p.connected && <span className="muted"> …</span>}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={p.volume}
                      onChange={(e) => v.setVolume(p.userId, Number(e.target.value))}
                      aria-label={`${nameOf(p.userId, p.name)} の音量`}
                      title="相手の音量"
                    />
                    <span className="tiny muted" style={{ width: 26, textAlign: "right" }}>
                      {p.volume}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
