"use client";

import { Fragment, memo } from "react";
import type { TimelineCard } from "@/lib/protocol";
import { useTimelineFit } from "@/hooks/useTimelineFit";
import { useT } from "@/lib/i18n";

// Memoized: the parent (GameRoom) re-renders every clock tick (~500ms); without
// memo every player's timeline would re-render twice a second, which is what made
// the board lag as cards pile up. Props are state-derived (stable between ticks).
export const Timeline = memo(function Timeline({
  cards,
  interactive = false,
  selectedSlot = null,
  onSelect,
  mysterySlot = null,
  compact = false,
}: {
  cards: TimelineCard[];
  interactive?: boolean;
  selectedSlot?: number | null;
  onSelect?: (slot: number) => void;
  /** Show a "?" mystery card at this slot (e.g. another player's pending placement). */
  mysterySlot?: number | null;
  compact?: boolean;
}) {
  const t = useT();
  const fitRef = useTimelineFit(cards.length);
  const Slot = ({ i }: { i: number }) => {
    if (mysterySlot === i) {
      return (
        <div className={"tl-card mystery" + (compact ? " compact" : "")}>
          <div className="q">?</div>
        </div>
      );
    }
    if (!interactive) return null;
    return (
      <div
        className={"slot interactive" + (selectedSlot === i ? " selected" : "")}
        onClick={() => onSelect?.(i)}
        role="button"
        aria-label={t("位置 {i}", { i })}
      >
        ＋
      </div>
    );
  };

  return (
    <div className="timeline" ref={fitRef}>
      <Slot i={0} />
      {cards.map((c, idx) => (
        <Fragment key={c.id}>
          <div className={"tl-card" + (compact ? " compact" : "")}>
            <div className="year">{c.year}</div>
            <div className="ttl">{c.title}</div>
            <div className="art">{c.artist}</div>
          </div>
          <Slot i={idx + 1} />
        </Fragment>
      ))}
      {cards.length === 0 && <span className="muted tiny">{t("カードなし")}</span>}
    </div>
  );
});
