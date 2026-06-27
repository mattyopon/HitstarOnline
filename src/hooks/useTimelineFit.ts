"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Fan-fit for a `.timeline` flex row. As the hand grows, overlaps cards just
 * enough — via the `--tl-gap` custom property (a negative margin applied to
 * cards in globals.css) — that the row fits its container width, so the page
 * never widens. Recomputes when the card count changes and on container resize.
 * If even the maximum overlap can't fit (very long hands), the timeline's own
 * `overflow-x: auto` scrolls as a fallback.
 *
 * Attach the returned ref to the `.timeline` element.
 */
export function useTimelineFit(count: number) {
  const ref = useRef<HTMLDivElement>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Measure at zero overlap first (reading scrollWidth forces a reflow).
    el.style.setProperty("--tl-gap", "0px");
    const cards = el.querySelectorAll<HTMLElement>(".tl-card");
    const gaps = cards.length - 1;
    if (gaps < 1) return;
    const excess = el.scrollWidth - el.clientWidth;
    if (excess <= 1) return; // already fits → no overlap
    const cardW = cards[0].getBoundingClientRect().width || 80;
    const minVisible = Math.min(44, cardW * 0.45); // keep this much of each card showing
    const maxOverlap = Math.max(0, cardW - minVisible);
    const overlap = Math.min(maxOverlap, Math.ceil(excess / gaps) + 1);
    el.style.setProperty("--tl-gap", `-${overlap}px`);
  }, []);

  useLayoutEffect(() => {
    fit();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, count]);

  return ref;
}
