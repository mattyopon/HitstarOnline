"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { GACHA_CHARS } from "@/lib/gachaChars";

// Pre-auth hero landing screen (DESIGN_SPEC.md §画面別構成 › Title,
// mocks/index.html .screen-title). Replaces the old SignIn-only card as the
// unauthenticated branch of src/app/page.tsx.
//
// The guest/Google handlers below are lifted verbatim from SignIn.tsx (same
// Supabase calls, same sign-out-before-OAuth guard, same error copy) so the
// auth *behavior* is unchanged — only the surrounding chrome is new. SignIn
// itself is left in place/unused-by-page.tsx per the task (no auth logic was
// reinvented here).
export function Title({ authError }: { authError?: string | null }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(
    authError ? t("ログインに失敗しました：{error}", { error: authError }) : null,
  );

  async function google() {
    setBusy("google");
    setErr(null);
    const supabase = createClient();
    // Sign out any existing (e.g. anonymous/guest) session first so the OAuth
    // flow is a clean sign-in, not an anonymous→OAuth conversion (which can fail).
    await supabase.auth.signOut().catch(() => {});
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        // Basic, non-sensitive scopes only → no Google app-verification needed,
        // so sign-in works worldwide. (The YouTube-favorites scope is sensitive
        // and blocks unverified apps; re-add via incremental auth once verified.)
        scopes: "openid email profile",
      },
    });
    if (error) {
      setErr(t("Googleログインを開始できませんでした。Supabaseの設定をご確認ください。"));
      setBusy(null);
    }
  }

  async function guest() {
    setErr(null);
    setBusy("guest");
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setErr(t("ゲスト参加が無効です。Supabaseで匿名サインインを有効にしてください。"));
      setBusy(null);
    }
  }

  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

  // Hero = the flashiest SSR (EDM Stellaris); two SSR/SR co-stars float beside her.
  const hero = GACHA_CHARS.find((c) => c.id === "stellaris") ?? GACHA_CHARS[0];
  const miniA = GACHA_CHARS.find((c) => c.id === "velvet") ?? GACHA_CHARS[1];
  const miniB = GACHA_CHARS.find((c) => c.id === "popciel") ?? GACHA_CHARS[2];
  const rosterShown = GACHA_CHARS.slice(0, 12);
  const rosterMore = GACHA_CHARS.length - rosterShown.length;

  return (
    <div className="screen-title">
      <div className="title-deco" aria-hidden="true">
        <span className="title-deco-item">♪</span>
        <span className="title-deco-item">♡</span>
        <span className="title-deco-item">♫</span>
        <span className="title-deco-item">★</span>
        <span className="title-deco-item">♩</span>
      </div>

      <div className="title-stage">
        <div className="title-char">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="title-char-hero" src={hero.img} alt={hero.nm} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="title-mini-char tmc1" src={miniA.img} alt="" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="title-mini-char tmc2" src={miniB.img} alt="" aria-hidden="true" />
        </div>

        <div className="title-info">
          <h1 className="title-logo-text title-hero-logo">
            {t("ヒットスター")}
            <span className="small">{t("HITSTAR ONLINE · 15人のミューズと音楽の旅")}</span>
          </h1>
          <p className="title-tagline">
            <span>
              {t("曲を聴いて")}
              <strong>{t("年代を当てよう。")}</strong>
            </span>
            <br />
            <em>{t("15人の個性ゆたかなミューズ")}</em>
            {t("と一緒に♪")}
            <br />
            {t(
              "中華風、昭和、ナイトラウンジ、フェス…時代を超えた仲間たちと音楽の世界を旅しよう♡",
            )}
          </p>

          {err && (
            <p className="title-error" role="alert">
              {err}
            </p>
          )}

          <div className="title-buttons">
            <button className="btn-primary" onClick={guest} disabled={!!busy}>
              {busy === "guest" ? t("参加中…") : t("▶ プレイスタート")}
            </button>
            {googleEnabled && (
              <button className="btn-secondary" onClick={google} disabled={!!busy}>
                <GoogleMark />
                {busy === "google" ? t("リダイレクト中…") : t("Googleでログイン")}
              </button>
            )}
          </div>

          <div className="title-roster-strip">
            <div className="lbl">{t("★ 全15人のミューズ ★")}</div>
            <div className="title-roster-row">
              {rosterShown.map((c) => (
                <span className="av" key={c.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.img} alt={c.nm} style={{ objectPosition: c.focus }} />
                </span>
              ))}
              {rosterMore > 0 && <span className="more">+{rosterMore}</span>}
            </div>
          </div>

          <div className="title-footer">
            <span>
              <span className="pulse" aria-hidden="true" />
              {t("ONLINE · {n}", { n: "12,481" })}
            </span>
            <span>{t("Ver. {v}", { v: "0.1.0" })}</span>
            <span>{t("♡ {n} PLAYERS", { n: "1.2M" })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
