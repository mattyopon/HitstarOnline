"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { api } from "@/lib/clientApi";
import { GameRoom } from "./GameRoom";
import { Brand } from "./Brand";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="center-screen">{children}</div>;
}

export function RoomClient({ code }: { code: string }) {
  const CODE = code.toUpperCase();
  const router = useRouter();
  const { user, loading } = useUser();
  const [joined, setJoined] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // Guard so we attempt the join exactly once per (user, room), even though the
  // auth listener may emit several events (INITIAL_SESSION/SIGNED_IN/refresh).
  const joinKey = useRef<string | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (loading || !userId) return;
    const key = `${userId}:${CODE}`;
    if (joinKey.current === key) return;
    joinKey.current = key;

    let cancelled = false;
    const name =
      (typeof window !== "undefined" && localStorage.getItem("hitstar_name")) ||
      user?.name ||
      "ゲスト";
    api("/api/room/join", { code: CODE, name })
      .then(() => {
        if (!cancelled) {
          setJoined(true);
          // Remember this room so a refresh / accidental navigation can offer
          // "return to room" from the home screen. Cleared on explicit leave.
          try {
            localStorage.setItem("hitstar_last_room", CODE);
          } catch {
            /* ignore */
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          joinKey.current = null; // allow a retry on next render
          setJoinErr(e instanceof Error ? e.message : "参加に失敗しました");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loading, userId, CODE, user?.name, retry]);

  if (loading) {
    return (
      <Centered>
        <span className="spin-loader" />
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <div className="card stack" style={{ maxWidth: 420, textAlign: "center" }}>
          <Brand />
          <p className="muted">
            部屋 <strong>{CODE}</strong> に参加するにはログインが必要です。
          </p>
          <button className="btn" onClick={() => router.push("/")}>
            ログイン画面へ
          </button>
        </div>
      </Centered>
    );
  }

  if (joinErr) {
    return (
      <Centered>
        <div className="card stack" style={{ maxWidth: 420, textAlign: "center" }}>
          <h2>参加できませんでした</h2>
          <p className="muted">{joinErr}</p>
          <div className="row" style={{ gap: 10, justifyContent: "center" }}>
            <button
              className="btn"
              onClick={() => {
                setJoinErr(null);
                setRetry((r) => r + 1);
              }}
            >
              再試行
            </button>
            <button className="btn secondary" onClick={() => router.push("/")}>
              ホームに戻る
            </button>
          </div>
        </div>
      </Centered>
    );
  }

  if (!joined) {
    return (
      <Centered>
        <span className="spin-loader" />
      </Centered>
    );
  }

  return <GameRoom code={CODE} meId={user.id} />;
}
