"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  PACKS,
  isPackId,
  type PackKind,
} from "@/lib/protocol";
import { useT } from "@/lib/i18n";
import { ThemeRow, type RowItem } from "./ThemeRow";
import { deriveTileStyle } from "./tileStyle";

export interface ThemeBrowserProps {
  /** Controlled selection = the settings.categories array shape (genre + pack ids). */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Genres are multi-select (always true in practice; kept for API symmetry). */
  multi?: boolean;
  /** Vote tallies by id (vote variant): id -> vote count. */
  tally?: Record<string, number>;
  /** "lobby" shows packs + genres; "vote" shows genres only with tallies. */
  variant?: "lobby" | "vote";
  /** Whether to render the 特集パック rows (lobby only). */
  showPacks?: boolean;
}

/** Pack kind → eyebrow heading (Japanese; rendered via t()). */
const PACK_KIND_HEADING: Record<PackKind, string> = {
  franchise: "フランチャイズ",
  artist: "アーティスト",
  "anime-op": "アニメOP",
};
/** Pack kinds in display order. */
const PACK_KIND_ORDER: PackKind[] = ["franchise", "artist", "anime-op"];

/** Quiz-style packs get their own rail (Netflix row-per-collection): the
 *  Bilibili-quiz trio + 少女アニメ are registered as kind "anime-op" in
 *  protocol.ts but browse like a separate collection. */
const QUIZ_PACK_IDS = new Set([
  "pack:utattemita",
  "pack:bili-hits",
  "pack:jp-hits",
  "pack:shoujo-anime",
]);
/** Heading for the quiz rail (chrome string — flows through t()). */
const QUIZ_HEADING = "ソングクイズ";

/** A row descriptor before flat-index assignment. */
interface RowSpec {
  heading: string;
  items: RowItem[];
}

/**
 * Netflix-style visual scope selector (controlled). Composes ThemeRow rails and
 * owns the selection contract + cross-row keyboard navigation. Produces exactly
 * the settings.categories array the old picker did (genre ids and/or pack ids),
 * with pack selection EXCLUSIVE (matches resolveScopeFilter): picking a pack
 * clears genres; while any pack is selected genre tiles are dimmed/ignored.
 */
export function ThemeBrowser({
  selected,
  onChange,
  multi = true,
  tally,
  variant = "lobby",
  showPacks = false,
}: ThemeBrowserProps) {
  const t = useT();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const anyPack = useMemo(() => selected.some(isPackId), [selected]);
  const wantPacks = showPacks && variant === "lobby";

  // ── Selection contract ──────────────────────────────────────────────────────
  const toggle = useCallback(
    (id: string) => {
      const has = selectedSet.has(id);
      if (isPackId(id)) {
        // Packs are EXCLUSIVE vs genres: selecting a pack drops every genre id;
        // multiple packs union freely. Deselecting the last pack re-enables genres.
        const packsOnly = selected.filter(isPackId);
        if (has) {
          onChange(packsOnly.filter((x) => x !== id));
        } else {
          onChange([...packsOnly, id]);
        }
        return;
      }
      // Genre toggle. If a pack 縛り is active, genres are ignored — clicking a
      // genre is a no-op (the tile is also visually disabled).
      if (anyPack) return;
      if (has) {
        onChange(selected.filter((x) => x !== id));
      } else {
        onChange(multi ? [...selected, id] : [id]);
      }
    },
    [anyPack, multi, onChange, selected, selectedSet],
  );

  // ── Row composition ──────────────────────────────────────────────────────────
  const rows = useMemo<RowSpec[]>(() => {
    const specs: RowSpec[] = [];
    if (wantPacks) {
      const toItem = (p: (typeof PACKS)[number]): RowItem => ({
        id: p.id,
        labelJa: p.labelJa,
        eyebrow: "PACK" as const,
        selected: selectedSet.has(p.id),
      });
      for (const kind of PACK_KIND_ORDER) {
        // The quiz packs are split out of "アニメOP" into their own rail below.
        const packs = PACKS.filter((p) => p.kind === kind && !QUIZ_PACK_IDS.has(p.id));
        if (!packs.length) continue;
        specs.push({ heading: PACK_KIND_HEADING[kind], items: packs.map(toItem) });
      }
      const quiz = PACKS.filter((p) => QUIZ_PACK_IDS.has(p.id));
      if (quiz.length) specs.push({ heading: QUIZ_HEADING, items: quiz.map(toItem) });
    }
    // Genre row (always present). Dimmed when a pack 縛り is active.
    specs.push({
      heading: "ジャンル",
      items: CATEGORIES.map((c) => ({
        id: c.id,
        labelJa: c.labelJa,
        eyebrow: "GENRE" as const,
        selected: selectedSet.has(c.id),
        disabled: anyPack,
        tally: tally ? tally[c.id] : undefined,
      })),
    });
    return specs;
  }, [wantPacks, selectedSet, anyPack, tally]);

  // Flat index bookkeeping for roving tabindex + arrow navigation.
  const baseFlat = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const r of rows) {
      out.push(n);
      n += r.items.length;
    }
    return out;
  }, [rows]);
  const totalTiles = baseFlat.length ? baseFlat[baseFlat.length - 1] + rows[rows.length - 1].items.length : 0;

  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const registerTile = useCallback((flat: number, el: HTMLButtonElement | null) => {
    tileRefs.current[flat] = el;
  }, []);

  // Roving focus position (rowIndex, indexInRow). Default = first tile.
  const [active, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const activeFlat = useMemo(() => {
    const r = Math.min(active.row, Math.max(0, rows.length - 1));
    const base = baseFlat[r] ?? 0;
    const colMax = Math.max(0, (rows[r]?.items.length ?? 1) - 1);
    return base + Math.min(active.col, colMax);
  }, [active, baseFlat, rows]);

  const [announce, setAnnounce] = useState("");

  const focusTile = useCallback(
    (row: number, col: number) => {
      const r = Math.max(0, Math.min(row, rows.length - 1));
      const colMax = Math.max(0, (rows[r]?.items.length ?? 1) - 1);
      const c = Math.max(0, Math.min(col, colMax));
      setActive({ row: r, col: c });
      const flat = (baseFlat[r] ?? 0) + c;
      const el = tileRefs.current[flat];
      if (el) {
        el.focus();
        // Respect prefers-reduced-motion: an explicit JS `behavior:"smooth"` would
        // override the CSS scroll-behavior:auto we set for reduced-motion users.
        const reduce =
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: reduce ? "auto" : "smooth",
        });
      }
    },
    [baseFlat, rows],
  );

  const onTileFocus = useCallback((row: number, col: number) => {
    setActive({ row, col });
  }, []);

  // ── Hero backdrop (Netflix browse): follows hover/focus, falls back to the
  // first selection, then the first tile. Stable callback so memo'd tiles
  // don't re-render. Lobby variant only (vote stays compact).
  const [previewId, setPreviewId] = useState<string | null>(null);
  const onPreview = useCallback((id: string | null) => setPreviewId(id), []);
  const heroItem = useMemo<RowItem | null>(() => {
    if (variant !== "lobby") return null;
    const id = previewId ?? selected[0] ?? rows[0]?.items[0]?.id;
    if (!id) return null;
    for (const r of rows) {
      const it = r.items.find((x) => x.id === id);
      if (it) return it;
    }
    return null;
  }, [variant, previewId, selected, rows]);

  const onTileKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, row: number, col: number) => {
      const rowLen = rows[row]?.items.length ?? 0;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          if (col + 1 < rowLen) focusTile(row, col + 1);
          else if (row + 1 < rows.length) focusTile(row + 1, 0);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (col - 1 >= 0) focusTile(row, col - 1);
          else if (row - 1 >= 0) focusTile(row - 1, (rows[row - 1]?.items.length ?? 1) - 1);
          break;
        case "ArrowDown":
          e.preventDefault();
          if (row + 1 < rows.length) focusTile(row + 1, col);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (row - 1 >= 0) focusTile(row - 1, col);
          break;
        case "Home":
          e.preventDefault();
          focusTile(row, 0);
          break;
        case "End":
          e.preventDefault();
          focusTile(row, rowLen - 1);
          break;
        case "Enter":
        case " ":
        case "Spacebar": {
          e.preventDefault();
          const it = rows[row]?.items[col];
          if (it && !it.disabled) {
            toggle(it.id);
            const willSelect = !it.selected;
            setAnnounce(
              t(willSelect ? "{name} を選択しました" : "{name} の選択を解除しました", {
                name: t(it.labelJa),
              }),
            );
          }
          break;
        }
        default:
          break;
      }
    },
    [focusTile, rows, t, toggle],
  );

  if (!totalTiles) return null;

  return (
    <div
      className={"scope-browser scope-" + variant}
      role="listbox"
      aria-multiselectable={multi}
      aria-label={t(variant === "vote" ? "ジャンルを選んで投票" : "出題テーマを選ぶ")}
    >
      {/* Hero backdrop: pure duplication of the focused/hovered tile's info at
          poster scale (same deterministic artwork) — aria-hidden so screen
          readers keep the listbox as the single source of truth. */}
      {heroItem && (
        <div className="scope-hero" aria-hidden="true" style={deriveTileStyle(heroItem.id)}>
          <div className="scope-hero-scrim" />
          <span className="scope-hero-eyebrow mono">{t(heroItem.eyebrow)}</span>
          <span className="scope-hero-title serif">{t(heroItem.labelJa)}</span>
          {heroItem.selected && <span className="scope-hero-badge mono">✓ {t("選択中")}</span>}
        </div>
      )}

      {rows.map((r, i) => (
        <ThemeRow
          key={r.heading + ":" + i}
          heading={r.heading}
          rowIndex={i}
          items={r.items}
          activeFlatIndex={activeFlat}
          baseFlatIndex={baseFlat[i]}
          onToggle={toggle}
          onTileKeyDown={onTileKeyDown}
          onTileFocus={onTileFocus}
          registerTile={registerTile}
          onPreview={onPreview}
        />
      ))}

      {wantPacks && anyPack && (
        <p className="scope-note tiny mono" role="note">
          {t("パック選択中はジャンルは無視されます")}
        </p>
      )}

      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
