"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { Brand } from "@/components/Brand";
import { SignIn } from "@/components/SignIn";
import { Lobby } from "@/components/Lobby";

function HomeInner() {
  const { user, loading } = useUser();
  const params = useSearchParams();
  const authError = params.get("authError") === "1";

  return (
    <div className="center-screen">
      <div className="card stack fade-in" style={{ width: "min(480px, 100%)" }}>
        <Brand />
        {loading ? (
          <div className="row" style={{ justifyContent: "center", padding: 20 }}>
            <span className="spin-loader" />
          </div>
        ) : user ? (
          <Lobby user={user} />
        ) : (
          <SignIn authError={authError} />
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
