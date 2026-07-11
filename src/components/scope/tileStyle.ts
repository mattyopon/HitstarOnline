// ───────────────────────────────────────────────────────────────────────────
// Deterministic, IMAGE-FREE tile look for the Netflix-style scope selector.
// Every genre/pack id maps to a stable {hue, motif} so the same tile always
// renders the same artwork — built entirely from CSS gradients + an optional
// inline SVG motif, all in the Vinyl Lounge palette (cream paper, espresso ink,
// gold + terracotta). No external/AI images: CSS/SVG/typography only.
// ───────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from "react";

/** A repeating background motif painted purely with CSS gradients. */
export type TileMotif =
  | "grooves" // concentric vinyl grooves
  | "waves" // soundwave bars
  | "rays" // diagonal sunburst rays
  | "dots" // halftone dot field
  | "stripes" // bold diagonal stripes
  | "checker" // soft checkerboard
  | "starfield" // sparse star specks
  | "marquee"; // theatre-marquee bulbs

/** Per-id curated look. Anything not listed falls back to a hashed look. */
interface TileLook {
  /** Base hue (deg) for the warm-tinted gradient. */
  hue: number;
  motif: TileMotif;
}

/** Vinyl Lounge accent ramp — warm hues only (terracotta → gold → olive → green). */
const HUES = [8, 14, 26, 36, 44, 58, 92, 140] as const;
const MOTIFS: TileMotif[] = [
  "grooves",
  "waves",
  "rays",
  "dots",
  "stripes",
  "checker",
  "starfield",
  "marquee",
];

/** Curated looks for the genre + pack ids we know about (ids from protocol.ts).
 *  Anything missing hashes its id deterministically, so new ids still get a
 *  stable look without a code change. */
const LOOKS: Record<string, TileLook> = {
  // ── Genres (CATEGORIES) ────────────────────────────────────────────────────
  jpop: { hue: 8, motif: "waves" },
  jidol: { hue: 330, motif: "marquee" },
  jrock: { hue: 18, motif: "stripes" },
  enka: { hue: 36, motif: "rays" },
  vocaloid: { hue: 180, motif: "dots" },
  "jp-anime": { hue: 8, motif: "rays" },
  tokusatsu: { hue: 14, motif: "marquee" },
  jrap: { hue: 268, motif: "stripes" },
  "game-music": { hue: 150, motif: "checker" },
  cnpop: { hue: 4, motif: "grooves" },
  "us-cartoon": { hue: 44, motif: "dots" },
  "movie-themes": { hue: 36, motif: "marquee" },
  christmas: { hue: 140, motif: "starfield" },
  classical: { hue: 40, motif: "grooves" },
  jazz: { hue: 26, motif: "waves" },
  bossa: { hue: 92, motif: "waves" },
  kpop: { hue: 320, motif: "dots" },
  uspop: { hue: 200, motif: "marquee" },
  rock: { hue: 14, motif: "stripes" },
  edm: { hue: 280, motif: "rays" },
  hiphop: { hue: 36, motif: "stripes" },
  rnb: { hue: 300, motif: "dots" },
  latin: { hue: 30, motif: "rays" },
  country: { hue: 36, motif: "checker" },
  reggae: { hue: 110, motif: "stripes" },
  bollywood: { hue: 20, motif: "rays" },
  karaoke: { hue: 44, motif: "marquee" },
  // ── Packs (PACKS) ───────────────────────────────────────────────────────────
  // Pack looks are kept DISTINCT from every genre look (and from each other):
  // tiles for a pack and a genre can appear in the same lobby view, so no two
  // ids may share the same {hue, motif} or they'd render byte-identical artwork.
  "pack:anime-op": { hue: 4, motif: "rays" },
  "pack:superstar": { hue: 48, motif: "marquee" },
  "pack:bz": { hue: 36, motif: "grooves" },
  "pack:lisa": { hue: 12, motif: "waves" },
  "pack:bump": { hue: 150, motif: "starfield" },
  "pack:yonezu": { hue: 70, motif: "dots" },
  "pack:utada": { hue: 36, motif: "waves" },
  "pack:mrchildren": { hue: 8, motif: "grooves" },
  "pack:oneokrock": { hue: 22, motif: "stripes" },
  "pack:southern": { hue: 150, motif: "rays" },
  "pack:mrsgreenapple": { hue: 70, motif: "checker" },
  "pack:yoasobi": { hue: 44, motif: "starfield" },
  "pack:higedan": { hue: 40, motif: "waves" },
  "pack:xjapan": { hue: 14, motif: "rays" },
  "pack:arashi": { hue: 8, motif: "marquee" },
};

/** Cheap, stable 32-bit string hash (FNV-1a) for the fallback look. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function lookFor(id: string): TileLook {
  const curated = LOOKS[id];
  if (curated) return curated;
  const h = hashId(id);
  return { hue: HUES[h % HUES.length], motif: MOTIFS[(h >>> 5) % MOTIFS.length] };
}

/** The CSS that paints the chosen motif as a layered background. */
function motifLayers(motif: TileMotif): string {
  switch (motif) {
    case "grooves":
      return "repeating-radial-gradient(circle at 78% 28%, rgba(26,18,8,0.16) 0 1.5px, transparent 1.5px 9px)";
    case "waves":
      return "repeating-linear-gradient(90deg, rgba(26,18,8,0.14) 0 3px, transparent 3px 11px)";
    case "rays":
      return "repeating-conic-gradient(from 0deg at 80% 18%, rgba(255,247,224,0.18) 0deg 6deg, transparent 6deg 18deg)";
    case "dots":
      return "radial-gradient(rgba(26,18,8,0.18) 1.4px, transparent 1.6px)";
    case "stripes":
      return "repeating-linear-gradient(135deg, rgba(26,18,8,0.16) 0 7px, transparent 7px 18px)";
    case "checker":
      return "repeating-conic-gradient(rgba(26,18,8,0.10) 0% 25%, transparent 0% 50%)";
    case "starfield":
      return [
        "radial-gradient(1.4px 1.4px at 22% 30%, rgba(255,247,224,0.7) 50%, transparent 51%)",
        "radial-gradient(1.2px 1.2px at 68% 22%, rgba(255,247,224,0.55) 50%, transparent 51%)",
        "radial-gradient(1.6px 1.6px at 48% 64%, rgba(255,247,224,0.5) 50%, transparent 51%)",
        "radial-gradient(1.2px 1.2px at 84% 70%, rgba(255,247,224,0.45) 50%, transparent 51%)",
      ].join(", ");
    case "marquee":
      return "radial-gradient(circle at 50% 50%, rgba(240,200,120,0.55) 1.4px, transparent 1.8px)";
  }
}

/** Background-size for the motif layer (keeps gradients crisp at any width).
 *  Only the dot-grid motifs need an explicit tile size; the rest scale with the
 *  box. CSS cycles a single size value across all motif sub-layers, so one value
 *  is enough even for the multi-gradient motifs (starfield). */
function motifSize(motif: TileMotif): string {
  switch (motif) {
    case "dots":
      return "13px 13px";
    case "checker":
      return "22px 22px";
    case "marquee":
      return "17px 17px";
    default:
      return "auto";
  }
}

/** Inline SVG glyph (data-uri) layered over the gradient for extra character:
 *  a single faint vinyl record in the top-right corner for cohesion. */
function svgGlyph(): string {
  return "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cg fill='none' stroke='%231a1208' stroke-opacity='0.16'%3E%3Ccircle cx='95' cy='28' r='22' stroke-width='1.4'/%3E%3Ccircle cx='95' cy='28' r='14' stroke-width='1'/%3E%3Ccircle cx='95' cy='28' r='6' stroke-width='1'/%3E%3C/g%3E%3Ccircle cx='95' cy='28' r='2' fill='%23d4a330' fill-opacity='0.55'/%3E%3C/svg%3E\")";
}

/** The full style for a tile's artwork layer, keyed off the id. */
export function deriveTileStyle(id: string): CSSProperties {
  const { hue, motif } = lookFor(id);
  // Warm two-stop wash anchored to the paper palette so tiles read as "Vinyl
  // Lounge" regardless of hue. Saturation/lightness are kept muted (cream-ish).
  const base = `hsl(${hue} 46% 64%)`;
  const deep = `hsl(${hue} 52% 38%)`;
  const wash = `linear-gradient(150deg, ${base} 0%, ${deep} 100%)`;
  const glyph = svgGlyph();
  const layers = [glyph, motifLayers(motif), wash].filter(Boolean).join(", ");
  return {
    // CSS custom prop drives the accent line/title underline in scope.css.
    ["--tile-accent" as string]: deep,
    backgroundImage: layers,
    backgroundSize: `120px 120px, ${motifSize(motif)}`,
  } as CSSProperties;
}
