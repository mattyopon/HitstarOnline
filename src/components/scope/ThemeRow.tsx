"use client";

import { useCallback, useRef } from "react";
import { useT } from "@/lib/i18n";
import { ThemeTile } from "./ThemeTile";

/** One tile's data within a row. */
export interface RowItem {
  id: string;
  labelJa: string;
  eyebrow: "GENRE" | "PACK";
  selected: boolean;
  disabled?: boolean;
  tally?: number;
  /** Unique songs in this scope (deck size), shown as a "{n}曲" chip. */
  count?: number;
}

export interface ThemeRowProps {
  /** Eyebrow heading shown above the rail (already Japanese; rendered via t()). */
  heading: string;
  /** Stable index of this row within the browser (for cross-row arrow nav). */
  rowIndex: number;
  items: RowItem[];
  /** Flat index (across all rows) of the currently roving tile. */
  activeFlatIndex: number;
  /** Flat index of the first tile in THIS row (so tabIndex math is global). */
  baseFlatIndex: number;
  onToggle: (id: string) => void;
  /** Keyboard handler bound to (rowIndex, indexWithinRow). */
  onTileKeyDown: (
    e: React.KeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
    indexInRow: number,
  ) => void;
  /** Focus bookkeeping: remembers the roving tile (rowIndex, indexInRow). */
  onTileFocus: (rowIndex: number, indexInRow: number) => void;
  /** Register the tile DOM node for programmatic focus/scrollIntoView. */
  registerTile: (flatIndex: number, el: HTMLButtonElement | null) => void;
  /** Hero preview: tile id on hover/focus, null when the pointer leaves. */
  onPreview?: (id: string | null) => void;
}

/**
 * A horizontal-scroll rail = one <section> with an IBM Plex Mono eyebrow heading
 * and a strip of ThemeTiles. The strip is the actual scroll container; mouse
 * drag-scroll is supported (touch scrolls natively). content-visibility:auto and
 * a min-width:0 strip keep it from widening the page.
 */
export function ThemeRow({
  heading,
  rowIndex,
  items,
  activeFlatIndex,
  baseFlatIndex,
  onToggle,
  onTileKeyDown,
  onTileFocus,
  registerTile,
  onPreview,
}: ThemeRowProps) {
  const t = useT();
  const stripRef = useRef<HTMLDivElement>(null);
  // Pointer drag-to-scroll state (mouse only; touch uses native scrolling).
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const strip = stripRef.current;
    if (!strip) return;
    drag.current = {
      active: true,
      startX: e.clientX,
      startLeft: strip.scrollLeft,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const strip = stripRef.current;
    if (!d.active || !strip) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    strip.scrollLeft = d.startLeft - dx;
  }, []);

  const endDrag = useCallback(() => {
    drag.current.active = false;
  }, []);

  // Suppress the click that fires after a real drag (so dragging never toggles).
  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      drag.current.moved = false;
    }
  }, []);

  if (!items.length) return null;

  return (
    <section className="scope-row" role="group" aria-label={t(heading)}>
      <h3 className="scope-row-heading mono">{t(heading)}</h3>
      <div
        ref={stripRef}
        className="scope-strip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        onMouseLeave={() => onPreview?.(null)}
      >
        {items.map((it, i) => {
          const flat = baseFlatIndex + i;
          return (
            <ThemeTile
              key={it.id}
              ref={(el) => registerTile(flat, el)}
              id={it.id}
              labelJa={it.labelJa}
              eyebrow={it.eyebrow}
              selected={it.selected}
              disabled={it.disabled}
              tally={it.tally}
              count={it.count}
              tabIndex={flat === activeFlatIndex ? 0 : -1}
              onToggle={onToggle}
              onKeyDown={(e) => onTileKeyDown(e, rowIndex, i)}
              onFocus={() => onTileFocus(rowIndex, i)}
              onPreview={onPreview}
            />
          );
        })}
      </div>
    </section>
  );
}
