"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase/client";
import { initLocale } from "@/lib/i18n";
import { Brand } from "@/components/Brand";
import { SignIn } from "@/components/SignIn";
import { Lobby } from "@/components/Lobby";

function HomeInner() {
  const { user, loading } = useUser();
  const params = useSearchParams();
  // authError is a human-readable message ("1" is the legacy flag).
  const rawErr = params.get("authError");
  const authError = rawErr ? (rawErr === "1" ? "ログインに失敗しました。" : rawErr) : null;

  const triedAnon = useRef(false);
  const [anonFailed, setAnonFailed] = useState(false);

  // Pick up the saved/browser language once, after hydration.
  useEffect(() => {
    initLocale();
  }, []);

  // Guest-first: auto-create an anonymous session so there's NO login wall —
  // solo and casual multiplayer are immediately playable. Google is optional
  // (an upgrade) for ranked / favorites. Skip auto-anon when an OAuth attempt
  // just failed, so the SignIn screen can show the error and let the user retry.
  useEffect(() => {
    if (loading || user || triedAnon.current || authError) return;
    triedAnon.current = true;
    createClient()
      .auth.signInAnonymously()
      .then(({ error }) => {
        if (error) setAnonFailed(true);
      })
      .catch(() => setAnonFailed(true));
  }, [loading, user, authError]);

  const showSignIn = !user && (!!authError || anonFailed);

  return (
    <div className="center-screen">
      <div className="card stack fade-in" style={{ width: "min(480px, 100%)" }}>
        <Brand />
        {user ? (
          <Lobby user={user} />
        ) : showSignIn ? (
          <SignIn authError={authError} />
        ) : (
          <div className="row" style={{ justifyContent: "center", padding: 20 }}>
            <span className="spin-loader" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}
