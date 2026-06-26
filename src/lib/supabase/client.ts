"use client";

import { createBrowserClient } from "@supabase/ssr";

type BrowserClient = ReturnType<typeof createBrowserClient>;
let singleton: BrowserClient | undefined;

/**
 * Browser-side Supabase client (singleton). Uses the public anon key; all
 * access is constrained by Row Level Security. Safe in client components.
 */
export function createClient(): BrowserClient {
  if (!singleton) {
    singleton = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return singleton;
}
