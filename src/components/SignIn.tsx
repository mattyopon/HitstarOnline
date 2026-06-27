"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";

export function SignIn({ authError }: { authError?: string | null }) {
  const t = useT();
  const [name, setName] = useState("");
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
    const nm = name.trim();
    if (nm) localStorage.setItem("hitstar_name", nm.slice(0, 24));
    setBusy("guest");
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setErr(t("ゲスト参加が無効です。Supabaseで匿名サインインを有効にしてください。"));
      setBusy(null);
    }
  }

  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

  return (
    <div className="stack">
      <p className="muted" style={{ marginTop: 0 }}>
        {t("曲を聴いて発売年を当て、年表に並べるパーティーゲーム。離れた友達と同じ部屋でリアルタイムに遊ぼう。")}
      </p>
      {err && <div className="error">{err}</div>}

      {googleEnabled && (
        <>
          <button className="btn google block" onClick={google} disabled={!!busy}>
            <GoogleMark />
            {busy === "google" ? t("リダイレクト中…") : t("Googleでログイン")}
          </button>
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span className="tiny muted">{t("または")}</span>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
        </>
      )}

      <input
        type="text"
        placeholder={t("ニックネーム")}
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && guest()}
      />
      <button className="btn block" onClick={guest} disabled={!!busy}>
        {busy === "guest" ? t("参加中…") : t("▶ ゲストとして始める")}
      </button>
      <p className="tiny muted" style={{ marginBottom: 0 }}>
        {googleEnabled
          ? t("※ ゲストはこの端末のみの一時アカウントです。")
          : t("※ いまはゲストですぐ遊べます（Googleログインは設定後に有効化）。")}
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
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
