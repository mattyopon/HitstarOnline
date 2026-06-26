"use client";

import { Fragment } from "react";
import type { TimelineCard } from "@/lib/protocol";

export function Timeline({
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
        aria-label={`位置 ${i}`}
      >
        ＋
      </div>
    );
  };

  return (
    <div className="timeline">
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
      {cards.length === 0 && <span className="muted tiny">カードなし</span>}
    </div>
  );
}
