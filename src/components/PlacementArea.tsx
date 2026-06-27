"use client";

import { Fragment, memo, useRef, useState } from "react";
import type { TimelineCard } from "@/lib/protocol";
import { useT } from "@/lib/i18n";

/**
 * Interactive timeline placement with drag-and-drop (touch + pointer) AND
 * tap-to-place fallback. Drag the mystery "?" tile into a gap on your timeline,
 * or simply tap a gap. Calls onSelect(slotIndex) when a gap is chosen.
 *
 * Memoized + rAF-throttled drag: the parent re-renders on every ~500ms clock
 * tick, and pointermove used to do a layout-forcing elementFromPoint() + setState
 * on every event — both got costlier as the timeline grew (the ">5 cards = laggy"
 * report). memo skips tick re-renders; the rAF throttle does at most one hit-test
 * per frame and only re-renders when the hovered slot actually changes.
 */
export const PlacementArea = memo(function PlacementArea({
  cards,
  selectedSlot,
  onSelect,
  hint = "タイルをドラッグして年表の正しい位置に置こう（タップでもOK）",
}: {
  cards: TimelineCard[];
  selectedSlot: number | null;
  onSelect: (slot: number) => void;
  hint?: string;
}) {
  const t = useT();
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastPt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  function slotAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const slot = el?.closest("[data-slot]");
    if (slot) {
      const v = slot.getAttribute("data-slot");
      if (v != null) return Number(v);
    }
    return null;
  }

  function moveGhost(x: number, y: number) {
    const g = ghost.current;
    if (g) {
      g.style.left = `${x}px`;
      g.style.top = `${y}px`;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    moveGhost(e.clientX, e.clientY);
    const s = slotAt(e.clientX, e.clientY);
    setHover((prev) => (prev === s ? prev : s));
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    lastPt.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current != null) return; // coalesce to one hit-test per frame
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const { x, y } = lastPt.current;
      moveGhost(x, y);
      const s = slotAt(x, y);
      setHover((prev) => (prev === s ? prev : s)); // re-render only on change
    });
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setDragging(false);
    const s = slotAt(e.clientX, e.clientY);
    setHover(null);
    if (s != null) onSelect(s);
  }

  const Slot = ({ i }: { i: number }) => {
    const cls =
      "slot interactive" +
      (selectedSlot === i ? " selected" : "") +
      (dragging && hover === i ? " drop-hover" : "");
    return (
      <div
        className={cls}
        data-slot={i}
        onClick={() => onSelect(i)}
        role="button"
        aria-label={t("位置 {i}", { i })}
      >
        ＋
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <div
          className={"tl-card mystery drag-handle" + (dragging ? " dragging" : "")}
          style={{ width: 96, minHeight: 96 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="q">?</div>
        </div>
        <div className="placement-hint">{t(hint)}</div>
      </div>

      <div className={"timeline" + (dragging ? " dragging" : "")}>
        <Slot i={0} />
        {cards.map((c, idx) => (
          <Fragment key={c.id}>
            {selectedSlot === idx && <MysteryGhostCard />}
            <div className="tl-card">
              <div className="year">{c.year}</div>
              <div className="ttl">{c.title}</div>
              <div className="art">{c.artist}</div>
            </div>
            <Slot i={idx + 1} />
          </Fragment>
        ))}
        {selectedSlot === cards.length && <MysteryGhostCard />}
      </div>

      {dragging && (
        <div ref={ghost} className="drag-ghost tl-card mystery">
          <div className="q">?</div>
        </div>
      )}
    </div>
  );
});

function MysteryGhostCard() {
  const t = useT();
  return (
    <div className="tl-card mystery" style={{ borderStyle: "solid", borderColor: "var(--accent)" }}>
      <div className="q" style={{ fontSize: 30 }}>★</div>
      <div className="tiny" style={{ color: "var(--accent)" }}>{t("ここ")}</div>
    </div>
  );
}
