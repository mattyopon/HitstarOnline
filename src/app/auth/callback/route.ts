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

  // Link-flow failures MUST be checked before the generic error branch: GoTrue
  // sends error + error_description ALONGSIDE error_code on linkIdentity
  // failures, and the guest session is still alive — so these bounce to the
  // Lobby with a conflict flag (rendered there) instead of the authError path
  // (which the signed-in Lobby never displays).
  const errCode = searchParams.get("error_code");
  if (
    errCode === "identity_already_exists" ||
    errCode === "email_exists" ||
    errCode === "user_already_exists"
  ) {
    return NextResponse.redirect(`${origin}/?linkConflict=1`);
  }
  if (errCode === "manual_linking_disabled") {
    return NextResponse.redirect(`${origin}/?linkConflict=cfg`);
  }

  if (provErr) return fail(provErr);
  if (!code) return fail("認証コードがありません");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);
  return NextResponse.redirect(`${origin}${next}`);
}
