"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/clientApi";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import type { ClientUser } from "@/hooks/useUser";
import { CATEGORIES } from "@/lib/protocol";
import type { BotDifficulty, GameMode } from "@/lib/protocol";
import { StatsPanel } from "./StatsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { useT } from "@/lib/i18n";

export function Lobby({ user }: { user: ClientUser }) {
  const t = useT();
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
  const [practice, setPractice] = useState(false);
  const [target, setTarget] = useState(10); // win-card count (configurable)
  const [cats, setCats] = useState<string[]>([]);
  const [ranked, setRanked] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // If we were in a room recently, offer a one-tap return (survives refresh).
  const [lastRoom, setLastRoom] = useState<string | null>(null);
  useEffect(() => {
    try {
      setLastRoom(localStorage.getItem("hitstar_last_room"));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCat(id: string) {
    setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  async function googleLogin() {
    setBusy("google");
    const supabase = createClient();
    // Sign out the current guest session first so OAuth is a clean sign-in
    // (avoids an anonymous→OAuth conversion that can fail at the callback).
    await supabase.auth.signOut().catch(() => {});
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        // Basic, non-sensitive scopes only → no Google app-verification needed,
        // so sign-in works worldwide. (The YouTube-favorites scope is sensitive
        // and would block unverified apps; re-add via incremental auth once the
        // OAuth consent screen is verified.)
        scopes: "openid email profile",
      },
    });
    if (error) {
      setErr(t("Googleログインを開始できませんでした"));
      setBusy(null);
    }
  }

  async function createSolo() {
    setBusy("solo");
    setErr(null);
    saveName();
    try {
      // Practice mode: no NPCs, just keep guessing songs.
      const body = practice
        ? { name, practice: true, settings: { categories: cats } }
        : {
            name,
            solo: { bots: Array.from({ length: botCount }, () => ({ difficulty: botDifficulty })) },
            settings: { categories: cats, targetCards: target },
          };
      const { code } = await api<{ code: string }>("/api/room/create", body);
      router.push(`/room/${code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("作成に失敗しました"));
      setBusy(null);
    }
  }

  function saveName() {
    if (typeof window !== "undefined") localStorage.setItem("hitstar_name", name.trim());
  }

  async function matchmake() {
    setBusy("matchmake");
    setErr(null);
    saveName();
    try {
      const { code } = await api<{ code: string }>("/api/rank/matchmake", { name });
      router.push(`/room/${code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("マッチメイキングに失敗しました"));
      setBusy(null);
    }
  }

  async function create() {
    setBusy("create");
    setErr(null);
    saveName();
    try {
      const { code } = await api<{ code: string }>("/api/room/create", {
        name,
        // Ranked uses a fixed target for fairness; casual honors the chosen count.
        settings: { mode, ranked, categories: cats, ...(ranked ? {} : { targetCards: target }) },
      });
      router.push(`/room/${code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("作成に失敗しました"));
      setBusy(null);
    }
  }

  function join() {
    const c = code.trim().toUpperCase();
    if (!c) {
      setErr(t("部屋コードを入力してください"));
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
    <div className="card-frame stack">
      <div className="row spread">
        <span className="pill">
          <Avatar name={name} url={user.avatarUrl} size="xs" />
          {user.isAnonymous ? t("ゲスト") : "Google"}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" onClick={() => setShowStats(true)}>
            ♬ {t("戦績")}
          </button>
          <button className="btn ghost sm" onClick={() => setShowSettings(true)} title={t("設定")}>
            ⚙
          </button>
          {/* Logout is only meaningful for real (Google) sign-ins. Guests are a
              throwaway anonymous session — signing them out just loses progress
              and re-creates a guest on reload, so we hide it for them. */}
          {!user.isAnonymous && (
            <button className="btn ghost sm" onClick={signOut}>
              {t("ログアウト")}
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="section-eyebrow">Side A · Set Up Your Session</div>
        <h2 className="section-ttl">{t("あなたのセットリストを組もう")}</h2>
      </div>

      {showStats && <StatsPanel onClose={() => setShowStats(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {err && <div className="error">{err}</div>}

      {lastRoom && (
        <button
          className="btn block gold"
          onClick={() => router.push(`/room/${lastRoom}`)}
        >
          ↩ {t("前の部屋に戻る")}（{lastRoom}）
        </button>
      )}

      <div className="mode-row row" style={{ gap: 8 }}>
        <button
          type="button"
          className={"mode-card" + (playMode === "multi" ? " featured" : "")}
          style={{ flex: 1 }}
          onClick={() => setPlayMode("multi")}
        >
          <span className="badge">Online</span>
          <div className="ttl">{t("みんなで")}</div>
          <div className="desc">{t("部屋コードで仲間と")}</div>
        </button>
        <button
          type="button"
          className={"mode-card" + (playMode === "solo" ? " featured" : "")}
          style={{ flex: 1 }}
          onClick={() => setPlayMode("solo")}
        >
          <span className="badge">Solo</span>
          <div className="ttl">{t("ソロ(1人)")}</div>
          <div className="desc">{t("NPC対戦・練習")}</div>
        </button>
      </div>

      <label className="section-eyebrow" style={{ marginBottom: 0 }}>{t("表示名")}</label>
      <input
        type="text"
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("あなたの名前")}
      />

      <label className="section-eyebrow" style={{ marginBottom: 0 }}>
        {t("出題カテゴリ（未選択＝全ジャンル）")}
      </label>
      <div className="cats">
        {CATEGORIES.map((c) => {
          const on = cats.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={"tag" + (on ? " on" : "")}
              aria-pressed={on}
              onClick={() => toggleCat(c.id)}
            >
              {t(c.labelJa)}
            </button>
          );
        })}
      </div>

      {(playMode === "solo" ? !practice : !ranked) && (
        <>
          <label className="section-eyebrow" style={{ marginBottom: 0 }}>{t("勝利に必要な枚数")}</label>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <button className="btn sm outline" onClick={() => setTarget((n) => Math.max(1, n - 1))}>
              －
            </button>
            <span
              className="serif"
              style={{
                minWidth: 42,
                textAlign: "center",
                fontSize: 32,
                fontStyle: "italic",
                fontWeight: 900,
                color: "var(--accent)",
              }}
            >
              {target}
            </span>
            <button className="btn sm outline" onClick={() => setTarget((n) => Math.min(50, n + 1))}>
              ＋
            </button>
            <span className="section-eyebrow" style={{ marginBottom: 0 }}>{t("枚で勝利")}</span>
          </div>
        </>
      )}

      {playMode === "multi" ? (
        <>
          {user.isAnonymous && (
            <div className="notice stack tiny" style={{ gap: 8 }}>
              <span>{t("👤 ゲストでもランク戦・対戦が遊べます。⭐お気に入り保存には Google ログインを。")}</span>
              <button className="btn google block" onClick={googleLogin} disabled={!!busy}>
                {busy === "google" ? t("リダイレクト中…") : t("Googleでログイン")}
              </button>
            </div>
          )}

          <label className="section-eyebrow" style={{ marginBottom: 0 }}>{t("ルール")}</label>
          {ranked ? (
            <div className="notice tiny">
              {t("🏆 ランクマッチ＝エキスパートルール（年＋曲名＋アーティスト正解で獲得）。結果は戦績に記録されます。")}
            </div>
          ) : (
            <select value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
              <option value="original">{t("オリジナル（配置のみで獲得・推測でトークン）")}</option>
              <option value="pro">{t("プロ（配置＋曲名/アーティスト正解が必要）")}</option>
              <option value="expert">{t("エキスパート（プロ＋難度高め）")}</option>
            </select>
          )}

          <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={ranked}
              onChange={(e) => setRanked(e.target.checked)}
              style={{ width: "auto" }}
            />
            <span className="tiny">{t("🏆 ランクマッチで遊ぶ（戦績に記録）")}</span>
          </label>

          {ranked ? (
            <>
              <button className="btn block gold" onClick={matchmake} disabled={!!busy}>
                {busy === "matchmake" ? t("対戦相手を探しています…") : t("🏆 ランクマッチを探す")}
              </button>
              <p className="tiny muted" style={{ marginBottom: 0 }}>
                {t("同じランク帯のプレイヤーと自動マッチング。1位で +25LP / それ以外 −20LP。")}
              </p>
            </>
          ) : (
            <button className="btn block gold" onClick={create} disabled={!!busy}>
              {busy === "create" ? t("作成中…") : t("♪ 部屋を作る")}
            </button>
          )}

          <div className="divider">{t("友達の部屋に入る")}</div>

          <div className="row">
            <input
              type="text"
              value={code}
              placeholder={t("部屋コード（例: AB23）")}
              maxLength={6}
              className="serif"
              style={{
                textTransform: "uppercase",
                letterSpacing: 6,
                textAlign: "center",
                fontStyle: "italic",
                fontWeight: 700,
              }}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <button className="btn outline" onClick={join} disabled={!!busy}>
              {t("参加")}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={practice}
              onChange={(e) => setPractice(e.target.checked)}
              style={{ width: "auto" }}
            />
            <span className="tiny">{t("🎯 練習モード（NPCなし・ひたすら曲を当て続ける）")}</span>
          </label>

          {!practice && (
            <>
              <label className="section-eyebrow" style={{ marginBottom: 0 }}>{t("NPC（CPU）の人数")}</label>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <button className="btn sm outline" onClick={() => setBotCount((c) => Math.max(1, c - 1))}>
                  －
                </button>
                <span
                  className="serif"
                  style={{
                    minWidth: 42,
                    textAlign: "center",
                    fontSize: 32,
                    fontStyle: "italic",
                    fontWeight: 900,
                    color: "var(--accent)",
                  }}
                >
                  {botCount}
                </span>
                <button className="btn sm outline" onClick={() => setBotCount((c) => Math.min(3, c + 1))}>
                  ＋
                </button>
              </div>

              <label className="section-eyebrow" style={{ marginBottom: 0 }}>{t("NPCの強さ")}</label>
              <select
                value={botDifficulty}
                onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
              >
                <option value="easy">{t("やさしい")}</option>
                <option value="normal">{t("ふつう")}</option>
                <option value="hard">{t("つよい")}</option>
              </select>
            </>
          )}

          <button className="btn block" onClick={createSolo} disabled={!!busy}>
            {busy === "solo"
              ? t("準備中…")
              : practice
                ? t("🎯 練習を始める")
                : t("▶ ソロで始める")}
          </button>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            {practice
              ? t("曲が流れたら年表の正しい位置にどんどん配置。NPCなしで好きなだけ練習できます。")
              : t("NPCがDJ＆対戦相手を担当します。曲が流れたら年表の正しい位置に配置！")}
          </p>
        </>
      )}
    </div>
  );
}
