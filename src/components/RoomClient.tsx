"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    const name =
      (typeof window !== "undefined" && localStorage.getItem("hitstar_name")) || user.name;
    api("/api/room/join", { code: CODE, name })
      .then(() => {
        if (!cancelled) setJoined(true);
      })
      .catch((e) => {
        if (!cancelled) setJoinErr(e instanceof Error ? e.message : "参加に失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user, CODE]);

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
          <button className="btn" onClick={() => router.push("/")}>
            ホームに戻る
          </button>
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
