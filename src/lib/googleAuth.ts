"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

// Google auth entry points, split by INTENT (design review of the guest→Google
// continuity gap; adversarially reviewed):
//
//   googleCleanSignIn — "log into MY Google account". Discards the current
//     (guest) session first. This is the right path for returning Google users
//     — including the auto-created empty guest every visitor gets on "/" — so
//     it stays a single OAuth round-trip with no scary dialogs.
//
//   googleLinkGuest — "SAVE this guest's data to Google". Uses linkIdentity,
//     which attaches the Google identity to the CURRENT anonymous user — the
//     user id (and therefore every stats/rank/gem/gacha/friend row) is kept.
//     Critically, this NEVER falls back to signOut on failure: the anonymous
//     session is the only key to the guest's data, and silently destroying it
//     was the original data-loss bug. Callers show the error and leave the
//     guest session untouched.
//
// Requires "Manual Linking" enabled in Supabase Auth settings — otherwise
// linkIdentity fails fast with manual_linking_disabled (surfaced to caller).

function oauthOptions(next: string) {
  return {
    redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    // Basic, non-sensitive scopes only → no Google app-verification needed.
    scopes: "openid email profile",
  };
}

/** Clean Google sign-in (drops the current session). Returns an error message
 *  or null when the OAuth redirect was started. */
export async function googleCleanSignIn(supabase: SupabaseClient, next = "/"): Promise<string | null> {
  // Sign out any existing (e.g. anonymous/guest) session first so the OAuth
  // flow is a clean sign-in for the chosen Google account.
  await supabase.auth.signOut().catch(() => {});
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: oauthOptions(next),
  });
  return error ? error.message : null;
}

/** Link the current ANONYMOUS session to Google, preserving the user id and
 *  all attached data. Returns null when the redirect was started, the string
 *  "manual_linking_disabled" when the Supabase setting is off, or the raw
 *  error message otherwise. The guest session is left intact on every error. */
export async function googleLinkGuest(supabase: SupabaseClient, next = "/"): Promise<string | null> {
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: oauthOptions(next),
  });
  if (!error) return null;
  const msg = error.message || "link failed";
  return /manual.*link/i.test(msg) ? "manual_linking_disabled" : msg;
}
