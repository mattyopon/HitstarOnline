"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/clientApi";
import { createClient } from "@/lib/supabase/client";
import type { ClientUser } from "@/hooks/useUser";
import { CATEGORIES } from "@/lib/protocol";
import type { BotDifficulty, GameMode } from "@/lib/protocol";

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
  const [playMode, setPlayMode] = useState<"solo" | "multi">("multi");
  const [botCount, setBotCount] = useState(1);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("normal");
  const [cats, setCats] = useState<string[]>([]);

  function toggleCat(id: string) {
    setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  async function googleLogin() {
    setBusy("google");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: "openid email profile https://www.googleapis.com/auth/youtube",
        queryParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
      },
    });
    if (error) {
      setErr("Googleログインを開始できませんでした");
      setBusy(null);
    }
  }

  async function createSolo() {
    setBusy("solo");
    setErr(null);
    saveName();
    try {
      const bots = Array.from({ length: botCount }, () => ({ difficulty: botDifficulty }));
      const { code } = await api<{ code: string }>("/api/room/create", {
        name,
        solo: { bots },
        settings: { categories: cats },
      });
      router.push(`/room/${code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "作成に失敗しました");
      setBusy(null);
    }
  }

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
        settings: { mode, categories: cats },
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
    try {
      localStorage.removeItem("hitstar_fav_playlist_id");
    } catch {
      /* ignore */
    }
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

      <div className="row" style={{ gap: 8 }}>
        <button
          className={"btn block" + (playMode === "multi" ? "" : " secondary")}
          onClick={() => setPlayMode("multi")}
        >
          👥 みんなで
        </button>
        <button
          className={"btn block" + (playMode === "solo" ? "" : " secondary")}
          onClick={() => setPlayMode("solo")}
        >
          🧑‍💻 ソロ(1人)
        </button>
      </div>

      <label className="tiny muted">表示名</label>
      <input
        type="text"
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        placeholder="あなたの名前"
      />

      <label className="tiny muted">出題カテゴリ（未選択＝全ジャンル）</label>
      <div className="row wrap" style={{ gap: 6 }}>
        {CATEGORIES.map((c) => {
          const on = cats.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className="pill"
              onClick={() => toggleCat(c.id)}
              style={{
                cursor: "pointer",
                borderColor: on ? "var(--accent)" : undefined,
                background: on ? "rgba(255,77,157,0.18)" : undefined,
                color: on ? "#fff" : undefined,
              }}
            >
              {c.labelJa}
            </button>
          );
        })}
      </div>

      {playMode === "multi" ? (
        user.isAnonymous ? (
          <div className="notice stack" style={{ gap: 10 }}>
            <span>👥 みんなで遊ぶには Google ログインが必要です（ゲストはソロのみ）。</span>
            <button className="btn google block" onClick={googleLogin} disabled={!!busy}>
              {busy === "google" ? "リダイレクト中…" : "Googleでログイン"}
            </button>
          </div>
        ) : (
          <>
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
          </>
        )
      ) : (
        <>
          <label className="tiny muted">NPC（CPU）の人数</label>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <button className="btn secondary" onClick={() => setBotCount((c) => Math.max(1, c - 1))}>
              －
            </button>
            <span style={{ minWidth: 24, textAlign: "center", fontWeight: 800 }}>{botCount}</span>
            <button className="btn secondary" onClick={() => setBotCount((c) => Math.min(3, c + 1))}>
              ＋
            </button>
          </div>

          <label className="tiny muted">NPCの強さ</label>
          <select
            value={botDifficulty}
            onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
          >
            <option value="easy">やさしい</option>
            <option value="normal">ふつう</option>
            <option value="hard">つよい</option>
          </select>

          <button className="btn block" onClick={createSolo} disabled={!!busy}>
            {busy === "solo" ? "準備中…" : "▶ ソロで始める"}
          </button>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            NPCがDJ＆対戦相手を担当します。曲が流れたら年表の正しい位置に配置！
          </p>
        </>
      )}
    </div>
  );
}
