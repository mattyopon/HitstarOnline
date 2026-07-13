import { NextResponse } from "next/server";
import { deckSizeForCategories } from "@/lib/deck";
import { CATEGORIES, PACKS } from "@/lib/protocol";

export const runtime = "nodejs";
export const dynamic = "force-static"; // deck.json is baked into the build

/**
 * Unique-song counts per selectable scope (all 27 genres + all packs), so the
 * theme picker can show each tile's deck size — previously the catalogue's
 * scale (18,000+ songs) was invisible in-product. Counts use the same
 * dedup(deckKey) sizing the game itself uses. Static per build: the deck only
 * changes on deploy, so this is served from the build output (no per-request
 * recompute, no auth needed — counts are not sensitive).
 */
let cached: Record<string, number> | null = null;

export async function GET() {
  if (!cached) {
    const sizes: Record<string, number> = {};
    for (const c of CATEGORIES) sizes[c.id] = deckSizeForCategories([c.id]);
    for (const p of PACKS) sizes[p.id] = deckSizeForCategories([p.id]);
    cached = sizes;
  }
  return NextResponse.json({ sizes: cached });
}
