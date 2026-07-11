import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OAuth (PKCE) callback: exchange the code for a session, then redirect home. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  // Prevent open redirect: only allow a single-leading-slash relative path.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : "/";

  // The provider can bounce back with an error instead of a code (denied
  // consent, misconfigured client, etc.) — surface it for diagnosis.
  const provErr = searchParams.get("error_description") || searchParams.get("error");
  const fail = (msg: string) =>
    NextResponse.redirect(`${origin}/?authError=${encodeURIComponent(msg.slice(0, 200))}`);

  if (provErr) return fail(provErr);
  if (!code) return fail("認証コードがありません");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);
  return NextResponse.redirect(`${origin}${next}`);
}
