"use client";

import { forwardRef, memo } from "react";
import { useT } from "@/lib/i18n";
import { deriveTileStyle } from "./tileStyle";

export interface ThemeTileProps {
  /** Genre or pack id (the value written into the selection array). */
  id: string;
  /** Display title (already the Japanese label; rendered via t()). */
  labelJa: string;
  /** Micro-eyebrow kind: "GENRE" | "PACK". */
  eyebrow: "GENRE" | "PACK";
  selected: boolean;
  /** Dimmed/inert (e.g. a genre tile while a pack 縛り is active). */
  disabled?: boolean;
  /** Roving-tabindex owner (only the active tile is in the tab order). */
  tabIndex: number;
  /** Optional vote tally badge (vote variant). */
  tally?: number;
  onToggle: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
}

/**
 * One scope tile: a memo'd role="option" button with an image-free, deterministic
 * artwork (deriveTileStyle), a Playfair italic title, and an IBM Plex Mono
 * micro-eyebrow ("GENRE"/"PACK"). Only transform/opacity animate.
 */
export const ThemeTile = memo(
  forwardRef<HTMLButtonElement, ThemeTileProps>(function ThemeTile(
    { id, labelJa, eyebrow, selected, disabled, tabIndex, tally, onToggle, onKeyDown, onFocus },
    ref,
  ) {
    const t = useT();
    const title = t(labelJa);
    return (
      <button
        ref={ref}
        type="button"
        role="option"
        aria-selected={selected}
        aria-disabled={disabled || undefined}
        data-id={id}
        tabIndex={tabIndex}
        className={"scope-tile" + (selected ? " is-selected" : "") + (disabled ? " is-disabled" : "")}
        style={deriveTileStyle(id)}
        onClick={() => !disabled && onToggle(id)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        title={title}
      >
        <span className="scope-tile-eyebrow mono">{t(eyebrow)}</span>
        <span className="scope-tile-title serif">{title}</span>
        {selected && (
          <span className="scope-tile-check" aria-hidden="true">
            ✓
          </span>
        )}
        {tally != null && tally > 0 && (
          <span className="scope-tile-tally mono">{t("{n}票", { n: tally })}</span>
        )}
      </button>
    );
  }),
);
