"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/clientApi";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import type { ClientUser } from "@/hooks/useUser";
import type { BotDifficulty, GameMode } from "@/lib/protocol";
import { StatsPanel } from "./StatsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ThemeBrowser } from "./scope/ThemeBrowser";
import { ResourceBar } from "./ResourceBar";
import { PartyStrip } from "./PartyStrip";
import { DanmuStrip } from "./DanmuStrip";
import { Roster } from "./Roster";
import { GachaScreen } from "./GachaScreen";
import { FriendsScreen } from "./FriendsScreen";
import { ShopScreen } from "./ShopScreen";
import { GACHA_CHARS, leaderPortrait } from "@/lib/gachaChars";
import type { CharacterListResponse } from "@/lib/gachaTypes";
import { useFriends } from "@/hooks/useFriends";
import { useT } from "@/lib/i18n";

// Lobby's own local sub-screens (Roster/Gacha/Friends/Shop). This is
// intentionally a tiny client-side view switch, not a router: each screen is
// reached from the bottom nav / party-strip edit affordance and renders as a
// full-bleed sibling above the Lobby's normal content so the existing
// room-create/join flow underneath is left completely untouched.
type LobbyView = "home" | "roster" | "gacha" | "friends" | "shop";

// Featured character shown in the center stage speech-bubble ("today's
// pickup"). Fixed pick for now — a real banner/rotation can replace this
// later without touching the surrounding layout.
const FEATURED_CHAR = GACHA_CHARS.find((c) => c.id === "velvet") ?? GACHA_CHARS[0];

/**
 * Fetch of the caller's gacha resources/roster/party (GET /api/character/list).
 * Loading/error are surfaced separately from the existing room-related
 * `busy`/`err` state so a gacha-layer hiccup (e.g. this design-review
 * branch's migration not being applied yet) never blocks the pre-existing
 * room create/join flow.
 *
 * Re-fetches whenever `refreshKey` changes, so the Lobby can pull fresh
 * gems/party data after the user visits Roster (party edit) or Gacha (spent
 * gems) and comes back.
 */
function useGachaSummary(refreshKey: number) {
  const [data, setData] = useState<CharacterListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/character/list")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as CharacterListResponse;
      })
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        // Expected on this design-review branch until migration 0006 is
        // applied to a real database — fall back to the zero/empty state
        // rather than crashing the Lobby.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  return { gems: data?.gems ?? null, party: data?.party ?? null, loading };
}

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

  // Presence heartbeat: bump the caller's last_seen_at on Lobby mount and every
  // 60s while the Lobby is open, so friends see an accurate online dot. Purely
  // best-effort — failures (e.g. migration 0007 not yet applied) are swallowed.
  useEffect(() => {
    const beat = () => {
      fetch("/api/friends/heartbeat", { method: "POST" }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 60_000);
    return () => clearInterval(id);
  }, []);

  // Local sub-screen switch (see LobbyView above) — Roster/Gacha render as an
  // overlay above the rest of Lobby's markup; the room create/join flow below
  // is unaffected. `gachaRefreshKey` bumps to re-fetch gems/party whenever the
  // user returns to "home" from either sub-screen (e.g. after a pull or a
  // party edit).
  const [view, setView] = useState<LobbyView>("home");
  const [gachaRefreshKey, setGachaRefreshKey] = useState(0);
  function closeSubScreen() {
    setView("home");
    setGachaRefreshKey((k) => k + 1);
  }

  const { gems, party, loading: gachaLoading } = useGachaSummary(gachaRefreshKey);
  // Lightweight friend-count summary for the home-view "フレンド" panel entry.
  const { data: friendsData } = useFriends();

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

  // Roster/Gacha are reached from the bottom nav (and the party-strip "edit"
  // button) as full-bleed sibling screens, matching how Title/Lobby/Battle
  // are each their own full-screen layout in the mock. Returning via onClose
  // bumps gachaRefreshKey so the resource bar / party strip reflect any
  // change (pull results, party edits) once we're back on "home".
  if (view === "roster") {
    return <Roster onClose={closeSubScreen} />;
  }
  if (view === "gacha") {
    return <GachaScreen onClose={closeSubScreen} />;
  }
  if (view === "friends") {
    return <FriendsScreen onClose={closeSubScreen} />;
  }
  if (view === "shop") {
    return <ShopScreen onClose={closeSubScreen} />;
  }

  return (
    <div className="screen-lobby-inner">
      <div className="lobby-shell">
        {showStats && <StatsPanel onClose={() => setShowStats(false)} />}
        {showSettings && (
          <SettingsPanel onClose={() => setShowSettings(false)} onOpenRoster={() => setView("roster")} />
        )}

        <div className="lobby-top">
          <div className="player-card">
            {/* The player's own avatar = their equipped party leader (slot 0)
                portrait, read from GET /api/character/list. Falls back to the
                Google avatar / name-letter chip when there's no party/leader
                (guest, empty slot, or the gacha fetch failed). Client-only —
                never published to rooms.state or shown for other players. */}
            <Avatar name={name} url={user.avatarUrl} image={leaderPortrait(party) ?? undefined} />
            <div className="player-info">
              <div className="nm">{name || t("ゲスト")}</div>
              <div className="meta">{user.isAnonymous ? t("ゲスト") : "Google"}</div>
            </div>
          </div>
          <ResourceBar gems={gems} loading={gachaLoading} />
          <button type="button" className="icon-btn" onClick={() => setShowStats(true)} title={t("戦績")}>
            ♬
          </button>
          <button type="button" className="icon-btn" onClick={() => setShowSettings(true)} title={t("設定")}>
            ⚙
          </button>
          {/* Logout is only meaningful for real (Google) sign-ins. Guests are a
              throwaway anonymous session — signing them out just loses progress
              and re-creates a guest on reload, so we hide it for them. */}
          {!user.isAnonymous && (
            <button type="button" className="icon-btn" onClick={signOut} title={t("ログアウト")}>
              ↪
            </button>
          )}
        </div>

        <DanmuStrip />

        <PartyStrip party={party} onEdit={() => setView("roster")} />

        {err && <div className="error">{err}</div>}

        {lastRoom && (
          <button
            type="button"
            className="lobby-return-banner"
            onClick={() => router.push(`/room/${lastRoom}`)}
          >
            <span>↩ {t("前の部屋に戻る")}（{lastRoom}）</span>
          </button>
        )}

        <div className="mission-banner">
          <span className="badge">{t("毎日")}</span>
          <span>{t("表示名とテーマを選んで、今すぐ出撃しよう！")}</span>
        </div>

        <div className="lobby-main">
          <div className="lobby-left">
            <div className="panel">
              <h3>
                {t("セットアップ")}
                <small>{t("Set Up Your Session")}</small>
              </h3>
              <div className="lobby-subpanel" style={{ marginTop: 10 }}>
                <div className="menu-list">
                  <button
                    type="button"
                    className={"menu-item" + (playMode === "multi" ? " featured" : "")}
                    onClick={() => setPlayMode("multi")}
                  >
                    <span className="ic">👥</span>
                    <span className="text">
                      <span className="ttl">{t("みんなで")}</span>
                      <span className="sub">{t("部屋コードで仲間と")}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={"menu-item" + (playMode === "solo" ? " featured" : "")}
                    onClick={() => setPlayMode("solo")}
                  >
                    <span className="ic">🧑‍💻</span>
                    <span className="text">
                      <span className="ttl">{t("ソロ(1人)")}</span>
                      <span className="sub">{t("NPC対戦・練習")}</span>
                    </span>
                  </button>
                </div>

                <label className="lobby-field-label" htmlFor="lobby-name-input">
                  {t("表示名")}
                </label>
                <input
                  id="lobby-name-input"
                  type="text"
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("あなたの名前")}
                />
              </div>
            </div>

            <div className="panel">
              <h3>
                {t("出題テーマ")}
                <small>{t("未選択＝全ジャンル")}</small>
              </h3>
              <ThemeBrowser selected={cats} onChange={setCats} multi showPacks variant="lobby" />
            </div>
          </div>

          <div className="center-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="featured-art" src={FEATURED_CHAR.img} alt="" style={{ objectPosition: FEATURED_CHAR.focus }} />
            <div className="speech-bub top-left">★ {t("ピックアップ")} ★</div>
            <div className="speech-bub top-right">{t("「来てくれてうれしい♪」")}</div>
          </div>

          <div className="lobby-right">
            {(playMode === "solo" ? !practice : !ranked) && (
              <div className="panel">
                <h3>
                  {t("勝利条件")}
                  <small>{t("Win Target")}</small>
                </h3>
                <div className="lobby-stepper" style={{ marginTop: 10 }}>
                  <button type="button" className="btn sm outline" onClick={() => setTarget((n) => Math.max(1, n - 1))}>
                    －
                  </button>
                  <span className="val">{target}</span>
                  <button type="button" className="btn sm outline" onClick={() => setTarget((n) => Math.min(50, n + 1))}>
                    ＋
                  </button>
                  <span className="tiny muted">{t("枚で勝利")}</span>
                </div>
              </div>
            )}

            <div className="panel">
              <h3>
                {t("クイックプレイ")}
                <small>{t("1タップで開始")}</small>
              </h3>

              {playMode === "multi" ? (
                <div className="lobby-subpanel" style={{ marginTop: 10 }}>
                  {user.isAnonymous && (
                    <div className="notice stack tiny" style={{ gap: 8 }}>
                      <span>{t("👤 ゲストでもランク戦・対戦が遊べます。⭐お気に入り保存には Google ログインを。")}</span>
                      <button type="button" className="btn google block" onClick={googleLogin} disabled={!!busy}>
                        {busy === "google" ? t("リダイレクト中…") : t("Googleでログイン")}
                      </button>
                    </div>
                  )}

                  <label className="lobby-field-label" htmlFor="lobby-mode-select">
                    {t("ルール")}
                  </label>
                  {ranked ? (
                    <div className="notice tiny">
                      {t("🏆 ランクマッチ＝エキスパートルール（年＋曲名＋アーティスト正解で獲得）。結果は戦績に記録されます。")}
                    </div>
                  ) : (
                    <select id="lobby-mode-select" value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
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

                  <div className="quickplay">
                    {ranked ? (
                      <button type="button" className="qp ranked" style={{ gridColumn: "1 / -1" }} onClick={matchmake} disabled={!!busy}>
                        <span className="ic">🏆</span>
                        {busy === "matchmake" ? t("対戦相手を探しています…") : t("ランクマッチを探す")}
                      </button>
                    ) : (
                      <button type="button" className="qp ranked" style={{ gridColumn: "1 / -1" }} onClick={create} disabled={!!busy}>
                        <span className="ic">♪</span>
                        {busy === "create" ? t("作成中…") : t("部屋を作る")}
                      </button>
                    )}
                  </div>
                  {ranked && (
                    <p className="tiny muted" style={{ marginBottom: 0 }}>
                      {t("同じランク帯のプレイヤーと自動マッチング。1位で +25LP / それ以外 −20LP。")}
                    </p>
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
                    <button type="button" className="btn outline" onClick={join} disabled={!!busy}>
                      {t("参加")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="lobby-subpanel" style={{ marginTop: 10 }}>
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
                      <label className="lobby-field-label">{t("NPC（CPU）の人数")}</label>
                      <div className="lobby-stepper">
                        <button type="button" className="btn sm outline" onClick={() => setBotCount((c) => Math.max(1, c - 1))}>
                          －
                        </button>
                        <span className="val">{botCount}</span>
                        <button type="button" className="btn sm outline" onClick={() => setBotCount((c) => Math.min(3, c + 1))}>
                          ＋
                        </button>
                      </div>

                      <label className="lobby-field-label" htmlFor="lobby-bot-difficulty">
                        {t("NPCの強さ")}
                      </label>
                      <select
                        id="lobby-bot-difficulty"
                        value={botDifficulty}
                        onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
                      >
                        <option value="easy">{t("やさしい")}</option>
                        <option value="normal">{t("ふつう")}</option>
                        <option value="hard">{t("つよい")}</option>
                      </select>
                    </>
                  )}

                  <button type="button" className="start-btn" onClick={createSolo} disabled={!!busy}>
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
                </div>
              )}
            </div>

            <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
              <h3>
                {t("フレンド")}
                <small>{t("{n}人がオンライン", { n: friendsData.friends.filter((f) => f.online).length })}</small>
              </h3>
              {/* Home-view entry point into the real FriendsScreen (add by code,
                  requests, presence, invite). The bottom-nav "仲間" tab opens
                  Roster; this panel opens Friends. */}
              <p className="tiny muted" style={{ marginBottom: 10 }}>
                {friendsData.incoming.length > 0
                  ? t("{n}件のフレンド申請が届いています。", { n: friendsData.incoming.length })
                  : t("{n}人のフレンド。コードを共有して増やそう！", { n: friendsData.friends.length })}
              </p>
              <button
                type="button"
                className="btn outline block"
                style={{ marginTop: "auto" }}
                onClick={() => setView("friends")}
              >
                {t("フレンドを見る")}
              </button>
            </div>
          </div>
        </div>

        <div className="bottom-nav">
          <button type="button" className="nav-tab on">
            🏠 {t("ホーム")}
          </button>
          <button
            type="button"
            className="nav-tab"
            onClick={() => {
              setPlayMode("multi");
              document.getElementById("lobby-name-input")?.scrollIntoView({ block: "center" });
            }}
          >
            ⚔ {t("出撃")}
          </button>
          <button type="button" className="nav-tab" onClick={() => setView("roster")}>
            👥 {t("仲間")}
          </button>
          <button type="button" className="nav-tab" onClick={() => setView("gacha")}>
            💎 {t("ガチャ")}
          </button>
          <button type="button" className="nav-tab" onClick={() => setView("shop")}>
            🛒 {t("ショップ")}
          </button>
        </div>
      </div>
    </div>
  );
}
