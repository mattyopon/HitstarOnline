"use client";

import { Fragment, useRef, useState } from "react";
import type { TimelineCard } from "@/lib/protocol";
import { useT } from "@/lib/i18n";

/**
 * Interactive timeline placement with drag-and-drop (touch + pointer) AND
 * tap-to-place fallback. Drag the mystery "?" tile into a gap on your timeline,
 * or simply tap a gap. Calls onSelect(slotIndex) when a gap is chosen.
 */
export function PlacementArea({
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
    setHover(slotAt(e.clientX, e.clientY));
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    moveGhost(e.clientX, e.clientY);
    setHover(slotAt(e.clientX, e.clientY));
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return;
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
}

function MysteryGhostCard() {
  const t = useT();
  return (
    <div className="tl-card mystery" style={{ borderStyle: "solid", borderColor: "var(--accent)" }}>
      <div className="q" style={{ fontSize: 30 }}>★</div>
      <div className="tiny" style={{ color: "var(--accent)" }}>{t("ここ")}</div>
    </div>
  );
}
