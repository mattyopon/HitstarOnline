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
      for (const kind of PACK_KIND_ORDER) {
        const packs = PACKS.filter((p) => p.kind === kind);
        if (!packs.length) continue;
        specs.push({
          heading: PACK_KIND_HEADING[kind],
          items: packs.map((p) => ({
            id: p.id,
            labelJa: p.labelJa,
            eyebrow: "PACK" as const,
            selected: selectedSet.has(p.id),
          })),
        });
      }
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
