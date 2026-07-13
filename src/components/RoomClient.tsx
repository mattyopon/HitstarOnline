"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { api } from "@/lib/clientApi";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { GameRoom } from "./GameRoom";
import { Brand } from "./Brand";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="center-screen">{children}</div>;
}

export function RoomClient({ code }: { code: string }) {
  const CODE = code.toUpperCase();
  const t = useT();
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
          setJoinErr(e instanceof Error ? e.message : t("参加に失敗しました"));
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
    // Invite landing: sign in RIGHT HERE instead of bouncing to "/" (which used
    // to lose the room code — the #1 detected onboarding dead end). Guest is one
    // tap; Google round-trips via /auth/callback?next=/room/CODE and lands back
    // here, where the join effect above fires automatically.
    return <InviteGate code={CODE} />;
  }

  if (joinErr) {
    return (
      <Centered>
        <div className="card stack" style={{ maxWidth: 420, textAlign: "center" }}>
          <span className="vinyl-mark" aria-hidden="true" style={{ margin: "0 auto" }} />
          <h2 className="section-ttl">{t("参加できませんでした")}</h2>
          <p className="muted">{joinErr}</p>
          <div className="row" style={{ gap: 10, justifyContent: "center" }}>
            <button
              className="btn"
              onClick={() => {
                setJoinErr(null);
                setRetry((r) => r + 1);
              }}
            >
              {t("再試行")}
            </button>
            <button className="btn outline" onClick={() => router.push("/")}>
              {t("ホームに戻る")}
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

/** Logged-out invite-link landing: nickname + guest/Google sign-in without
 * leaving the room URL. Auth handlers mirror Title.tsx (same Supabase calls),
 * except Google carries `next=/room/CODE` so the OAuth round trip returns here. */
function InviteGate({ code }: { code: string }) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

  async function guest() {
    setErr(null);
    const nm = name.trim();
    if (nm) localStorage.setItem("hitstar_name", nm.slice(0, 24));
    setBusy("guest");
    const { error } = await createClient().auth.signInAnonymously();
    // Success needs no navigation: the auth listener flips `user` and the
    // join effect takes over on this same page.
    if (error) {
      setErr(t("ゲスト参加が無効です。Supabaseで匿名サインインを有効にしてください。"));
      setBusy(null);
    }
  }

  async function google() {
    setErr(null);
    const nm = name.trim();
    if (nm) localStorage.setItem("hitstar_name", nm.slice(0, 24));
    setBusy("google");
    const supabase = createClient();
    // Sign out any existing (e.g. anonymous/guest) session first so the OAuth
    // flow is a clean sign-in, not an anonymous→OAuth conversion (which can fail).
    await supabase.auth.signOut().catch(() => {});
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(`/room/${code}`)}`,
        scopes: "openid email profile",
      },
    });
    if (error) {
      setErr(t("Googleログインを開始できませんでした。Supabaseの設定をご確認ください。"));
      setBusy(null);
    }
  }

  return (
    <Centered>
      <div className="card stack" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <Brand />
        <p className="muted" style={{ marginTop: 0 }}>
          {t("部屋 {code} に招待されています！ニックネームを決めてすぐ参加できます。", {
            code,
          })}
        </p>
        <span className="code-pill" style={{ alignSelf: "center" }}>{code}</span>
        {err && <div className="error">{err}</div>}
        <input
          type="text"
          placeholder={t("ニックネーム")}
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && guest()}
          aria-label={t("ニックネーム")}
        />
        <button className="btn block gold" onClick={guest} disabled={!!busy}>
          {busy === "guest" ? t("参加中…") : t("▶ ゲストですぐ参加")}
        </button>
        {googleEnabled && (
          <button className="btn google block outline" onClick={google} disabled={!!busy}>
            {busy === "google" ? t("リダイレクト中…") : t("Googleでログインして参加")}
          </button>
        )}
        <p className="fine serif" style={{ marginBottom: 0 }}>
          {t("※ ゲストはこの端末のみの一時アカウントです。戦績やガチャを残すならGoogleでログイン。")}
        </p>
      </div>
    </Centered>
  );
}
