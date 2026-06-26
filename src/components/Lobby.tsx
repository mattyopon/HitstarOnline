"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/clientApi";
import { createClient } from "@/lib/supabase/client";
import type { ClientUser } from "@/hooks/useUser";
import type { GameMode } from "@/lib/protocol";

export function Lobby({ user }: { user: ClientUser }) {
  const router = useRouter();
  const [name, setName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hitstar_name") || user.name;
    }
    return user.name;
  });
  const [mode, setMode] = useState<GameMode>("original");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function saveName() {
    if (typeof window !== "undefined") localStorage.setItem("hitstar_name", name.trim());
  }

  async function create() {
    setBusy("create");
    setErr(null);
    saveName();
    try {
      const { code } = await api<{ code: string }>("/api/room/create", {
        name,
        settings: { mode },
      });
      router.push(`/room/${code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "作成に失敗しました");
      setBusy(null);
    }
  }

  function join() {
    const c = code.trim().toUpperCase();
    if (!c) {
      setErr("部屋コードを入力してください");
      return;
    }
    saveName();
    setBusy("join");
    router.push(`/room/${c}`);
  }

  async function signOut() {
    await createClient().auth.signOut();
    location.reload();
  }

  return (
    <div className="stack">
      <div className="row spread">
        <span className="pill">
          <span className="avatar" style={{ width: 24, height: 24, fontSize: 12 }}>
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </span>
          {user.isAnonymous ? "ゲスト" : "Google"}
        </span>
        <button className="btn ghost tiny" onClick={signOut}>
          ログアウト
        </button>
      </div>

      {err && <div className="error">{err}</div>}

      <label className="tiny muted">表示名</label>
      <input
        type="text"
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        placeholder="あなたの名前"
      />

      <label className="tiny muted">ルール</label>
      <select value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
        <option value="original">オリジナル（配置のみで獲得・推測でトークン）</option>
        <option value="pro">プロ（配置＋曲名/アーティスト正解が必要）</option>
        <option value="expert">エキスパート（プロ＋難度高め）</option>
      </select>

      <button className="btn block" onClick={create} disabled={!!busy}>
        {busy === "create" ? "作成中…" : "🎵 部屋を作る"}
      </button>

      <div className="row" style={{ gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span className="tiny muted">友達の部屋に入る</span>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>

      <div className="row">
        <input
          type="text"
          value={code}
          placeholder="部屋コード（例: AB23）"
          maxLength={6}
          style={{ textTransform: "uppercase", letterSpacing: 3 }}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
        />
        <button className="btn secondary" onClick={join} disabled={!!busy}>
          参加
        </button>
      </div>
    </div>
  );
}
