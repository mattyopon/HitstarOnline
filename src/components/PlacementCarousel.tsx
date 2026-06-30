"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import type { TimelineCard } from "@/lib/protocol";
import { useT } from "@/lib/i18n";

// ───────────────────────────────────────────────────────────────────────────
// Destiny-Child-style coverflow PLACEMENT PICKER.
//
// Items are the placement SLOTS 0..timeline.length (timeline.length+1 of them).
// Slot i means "the mystery card goes between timeline[i-1] and timeline[i]".
// The item nearest the viewport CENTER is "focused" — focus is NOT an event, it
// is a pure POSITION FUNCTION of d = (itemCenterX - viewportCenterX) / BASE_WIDTH
// evaluated for every item every rAF frame (scale / rotateY / opacity / depth).
//
// The ONLY discrete event is SETTLE: when the carousel comes to rest on a slot it
// fires onSelect(slot) once. It NEVER submits — confirming stays with the 提出
// button / the GameRoom deadline auto-place, both of which read selectedSlot.
//
// SINGLE SOURCE OF TRUTH for "selected": paint() drives ONLY the continuous
// position-function visuals (transform/opacity/z-order — the center item is
// naturally largest/forward = "centered"). It NEVER touches aria-selected or the
// chosen-highlight. Those derive SOLELY from the selectedSlot prop in JSX, so
// when selectedSlot is null NO item is selected/highlighted (a fresh turn shows
// a centered-but-unchosen card, matching the disabled 提出 button). "Centered" is
// thus visually & semantically distinct from "selected/chosen".
//
// All physics writes go straight to DOM nodes via refs (no setState during
// motion); the single rAF loop mirrors PlacementArea's coalesce discipline.
// ───────────────────────────────────────────────────────────────────────────

// ── Tunables (NO inline literals in the physics/transform code below) ────────
const BASE_WIDTH = 140; // px reference width of a focused card; denominator for d.
const ITEM_GAP = 24; // px gap between item centers beyond the card width.
const ITEM_STRIDE = BASE_WIDTH + ITEM_GAP; // 164 — px between adjacent centers.
const PERSPECTIVE_PX = 900; // CSS perspective so rotateY/translateZ read as 3D.
const MAX_ROTATE_DEG = 45; // max |rotateY| of side cards (inward tilt).
const MAX_SCALE = 1.0; // scale of the centered card.
const MIN_SCALE = 0.66; // scale floor for cards >= 1 width out.
const MIN_OPACITY = 0.35; // opacity floor for the farthest cards.
const DEPTH_PX = 120; // max translateZ pushback (negative) for side cards.
const MAX_TILT_RANGE = 2.5; // card-widths at which rotateY/opacity/depth clamp.
const FRICTION = 0.92; // per-frame momentum decay for rest prediction.
const VELOCITY_TO_REST = FRICTION / (1 - FRICTION); // 11.5 — coast multiplier.
const SNAP_STIFFNESS = 0.18; // spring constant easing offset -> slot center.
const SNAP_DAMPING = 0.82; // spring damping (near-critical, no ringing).
const SETTLE_PX = 0.5; // px-to-target below which (w/ low vel) we land.
const SETTLE_VEL = 0.4; // px/frame velocity below which settle fires.
const KEY_REPEAT_MS = 90; // throttle for held arrow-key repeat.
const VELOCITY_EMA = 0.4; // smoothing weight for sampled drag velocity.
const SCROLL_SETTLE_MS = 120; // debounce after native scroll before settling (reduced mode).

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const PlacementCarousel = memo(function PlacementCarousel({
  cards,
  selectedSlot,
  onSelect,
}: {
  cards: TimelineCard[];
  selectedSlot: number | null;
  onSelect: (slot: number) => void;
}) {
  const t = useT();
  const itemCount = cards.length + 1; // slots 0..cards.length

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Physics state (refs only — never setState during motion) ───────────────
  const scrollOffset = useRef(0); // px the track is scrolled (offset of center)
  const velocity = useRef(0); // px/frame
  const targetOffset = useRef(0); // spring goal (a slot center)
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);
  const lastDragOffset = useRef(0);
  const viewportWidth = useRef(0);
  const reducedRef = useRef(false);
  // Last settled index actually reported to onSelect — guards refire.
  const lastSettled = useRef<number | null>(null);
  // The index the spring is currently aiming at. Drives only the position-
  // function "centered" z-order in reduced mode — NOT selection (which is
  // derived solely from the selectedSlot prop in JSX).
  const aimingIndex = useRef<number>(0);
  const keyRepeatAt = useRef(0);

  const offsetForIndex = useCallback((i: number) => i * ITEM_STRIDE, []);

  // Apply the pure position-function to every item for the current scrollOffset.
  const paint = useCallback(() => {
    const vw = viewportWidth.current || viewportRef.current?.clientWidth || 0;
    const viewportCenterX = vw / 2;
    const off = scrollOffset.current;
    const reduced = reducedRef.current;
    const aim = aimingIndex.current;
    for (let i = 0; i < itemCount; i++) {
      const node = itemRefs.current[i];
      if (!node) continue;
      // Center of this item relative to the viewport, in px. trackOriginX is the
      // viewport center, so item 0 with off=0 sits at center.
      const itemCenterX = viewportCenterX + i * ITEM_STRIDE - off;
      const tx = i * ITEM_STRIDE - off; // translateX inside a centered track
      if (reduced) {
        // Reduced motion: no 3D ramp; native scroll-snap handles layout instead.
        // Only the position-function "centered" visual (z-order) — NOT selection.
        node.style.transform = "";
        node.style.opacity = "1";
        node.style.zIndex = i === aim ? "2" : "1";
        continue;
      }
      const d = (itemCenterX - viewportCenterX) / BASE_WIDTH;
      const ad = Math.abs(d);
      const adc = Math.min(ad, MAX_TILT_RANGE);
      // easeOutQuad on min(ad,1) for a snappier center.
      const k = 1 - Math.pow(1 - Math.min(ad, 1), 2);
      const scale = MAX_SCALE - (MAX_SCALE - MIN_SCALE) * k;
      const rotateY = -Math.sign(d) * MAX_ROTATE_DEG * Math.min(adc, 1);
      const opacity = Math.max(
        MIN_OPACITY,
        1 - (1 - MIN_OPACITY) * (Math.min(ad, MAX_TILT_RANGE) / MAX_TILT_RANGE),
      );
      const depth = -DEPTH_PX * (Math.min(adc, MAX_TILT_RANGE) / MAX_TILT_RANGE);
      const zIndex = Math.round(1000 - ad * 100);
      node.style.transform = `translateX(${tx}px) translateZ(${depth}px) rotateY(${rotateY}deg) scale(${scale})`;
      node.style.opacity = String(opacity);
      node.style.zIndex = String(zIndex);
    }
  }, [itemCount]);

  // Fire the single discrete SETTLE event (guarded so it fires once per landing).
  const settle = useCallback(
    (index: number) => {
      if (lastSettled.current === index) return;
      lastSettled.current = index;
      onSelect(index);
    },
    [onSelect],
  );

  // The spring/momentum rAF loop. Started on interaction, stopped on settle.
  const tick = useCallback(() => {
    rafRef.current = null;
    // Critically-damped spring easing scrollOffset -> targetOffset (dt = 1/frame).
    const x = scrollOffset.current;
    const target = targetOffset.current;
    const a = -SNAP_STIFFNESS * (x - target) - SNAP_DAMPING * velocity.current;
    velocity.current += a;
    scrollOffset.current += velocity.current;

    const snapIndex = clamp(Math.round(target / ITEM_STRIDE), 0, itemCount - 1);
    aimingIndex.current = snapIndex;

    paint();

    if (
      Math.abs(scrollOffset.current - target) < SETTLE_PX &&
      Math.abs(velocity.current) < SETTLE_VEL
    ) {
      // Landed: clamp exactly, stop the loop, fire settle exactly once.
      scrollOffset.current = target;
      velocity.current = 0;
      paint();
      settle(snapIndex);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [itemCount, paint, settle]);

  const startLoop = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Move the spring target to a slot (keyboard / tap / external selectedSlot).
  // Under reduced motion we jump instantly; the loop then settles next frame.
  const snapTo = useCallback(
    (index: number) => {
      const i = clamp(index, 0, itemCount - 1);
      targetOffset.current = offsetForIndex(i);
      aimingIndex.current = i;
      // A NEW intended destination means this is a fresh landing; allow refire.
      lastSettled.current = null;
      if (reducedRef.current) {
        scrollOffset.current = targetOffset.current;
        velocity.current = 0;
        // Sync native scroll position so the focused item is centered.
        const vp = viewportRef.current;
        const node = itemRefs.current[i];
        if (vp && node) node.scrollIntoView({ block: "nearest", inline: "center" });
      }
      startLoop();
    },
    [itemCount, offsetForIndex, startLoop],
  );

  // ── Pointer drag (touch + mouse) with velocity EMA ─────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (reducedRef.current) return; // native scroll handles reduced motion
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      draggingRef.current = true;
      dragStartX.current = e.clientX;
      dragStartOffset.current = scrollOffset.current;
      lastDragOffset.current = scrollOffset.current;
      velocity.current = 0;
      stopLoop();
    },
    [stopLoop],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      // Dragging right (positive dx) reveals earlier slots -> offset decreases.
      const next = dragStartOffset.current - (e.clientX - dragStartX.current);
      const instV = next - lastDragOffset.current;
      velocity.current = velocity.current * (1 - VELOCITY_EMA) + instV * VELOCITY_EMA;
      lastDragOffset.current = next;
      scrollOffset.current = next;
      aimingIndex.current = clamp(
        Math.round(next / ITEM_STRIDE),
        0,
        itemCount - 1,
      );
      lastSettled.current = null;
      paint();
    },
    [itemCount, paint],
  );

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    // Velocity-predicted rest: project the decaying-momentum coast distance,
    // then snap to the nearest slot to that PREDICTED point (not the current one).
    const predictedRest = scrollOffset.current + velocity.current * VELOCITY_TO_REST;
    const snapIndex = clamp(Math.round(predictedRest / ITEM_STRIDE), 0, itemCount - 1);
    targetOffset.current = offsetForIndex(snapIndex);
    aimingIndex.current = snapIndex;
    lastSettled.current = null;
    startLoop();
  }, [itemCount, offsetForIndex, startLoop]);

  // ── Wheel / trackpad: nudge target by one slot per gesture direction ───────
  // Attached as a NATIVE non-passive listener (React 19 registers onWheel as a
  // passive root listener, so e.preventDefault() there is a no-op and the page
  // would scroll under the carousel). A native { passive: false } listener lets
  // us actually consume the gesture.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = (e: WheelEvent) => {
      if (reducedRef.current) return; // native scroll-snap owns reduced motion
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      const cur = clamp(Math.round(targetOffset.current / ITEM_STRIDE), 0, itemCount - 1);
      snapTo(cur + (delta > 0 ? 1 : -1));
    };
    vp.addEventListener("wheel", handler, { passive: false });
    return () => vp.removeEventListener("wheel", handler);
  }, [itemCount, snapTo]);

  // ── Reduced motion: derive settle from native scroll-snap position ─────────
  // In reduced mode the JS physics path is bypassed (overflow-x:auto scroll-snap
  // handles layout), so neither pointer nor wheel updates selectedSlot. Listen to
  // native scroll and, once it quiesces, compute the centered item from scrollLeft
  // and fire settle so the 提出 button / deadline auto-place see the chosen slot.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const centeredIndex = () => {
      const viewportCenter = vp.scrollLeft + vp.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < itemCount; i++) {
        const node = itemRefs.current[i];
        if (!node) continue;
        const nodeCenter = node.offsetLeft + node.offsetWidth / 2;
        const dist = Math.abs(nodeCenter - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    };
    const onScroll = () => {
      if (!reducedRef.current) return; // only relevant when natively scrolling
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const idx = centeredIndex();
        aimingIndex.current = idx;
        paint();
        settle(idx);
      }, SCROLL_SETTLE_MS);
    };
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (timer != null) clearTimeout(timer);
      vp.removeEventListener("scroll", onScroll);
    };
  }, [itemCount, paint, settle]);

  // ── Keyboard: arrows move target; Home/End to ends. Enter is NOT submit. ───
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const cur = clamp(Math.round(targetOffset.current / ITEM_STRIDE), 0, itemCount - 1);
      let next = cur;
      if (e.key === "ArrowLeft") next = cur - 1;
      else if (e.key === "ArrowRight") next = cur + 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = itemCount - 1;
      else return;
      e.preventDefault();
      const now = performance.now();
      if (now - keyRepeatAt.current < KEY_REPEAT_MS && (e.key === "ArrowLeft" || e.key === "ArrowRight"))
        return; // throttle held repeat
      keyRepeatAt.current = now;
      snapTo(next);
    },
    [itemCount, snapTo],
  );

  // ── prefers-reduced-motion detection ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      reducedRef.current = mq.matches;
      const vp = viewportRef.current;
      if (vp) vp.classList.toggle("pc-reduced", mq.matches);
      paint();
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [paint]);

  // ── Viewport size tracking (ResizeObserver) + initial paint ────────────────
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const measure = () => {
      viewportWidth.current = vp.clientWidth;
      paint();
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [paint]);

  // ── Sync to external selectedSlot (tap on legacy grid, prior state, etc.) ──
  // selectedSlot maps 1:1 to the centered item; re-center without re-firing
  // onSelect for the value we are already on.
  useEffect(() => {
    const want = selectedSlot == null ? 0 : clamp(selectedSlot, 0, itemCount - 1);
    const curIndex = clamp(Math.round(scrollOffset.current / ITEM_STRIDE), 0, itemCount - 1);
    if (want === curIndex && rafRef.current == null) {
      // Already centered & at rest — just repaint aria/transforms, no settle.
      aimingIndex.current = want;
      lastSettled.current = selectedSlot == null ? null : want;
      paint();
      return;
    }
    targetOffset.current = offsetForIndex(want);
    aimingIndex.current = want;
    // Suppress a settle callback for an externally-driven value we already know.
    lastSettled.current = selectedSlot == null ? null : want;
    if (reducedRef.current) {
      scrollOffset.current = targetOffset.current;
      velocity.current = 0;
      paint();
    } else {
      startLoop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlot, itemCount]);

  // Cleanup the rAF on unmount.
  useEffect(() => () => stopLoop(), [stopLoop]);

  // ── Slot label (context shown on each candidate card) ──────────────────────
  const labelFor = (i: number): string => {
    if (cards.length === 0) return t("最古（{y}年より前）", { y: "—" });
    if (i === 0) return t("最古（{y}年より前）", { y: cards[0].year });
    if (i === cards.length) return t("最新（{y}年より後）", { y: cards[cards.length - 1].year });
    return t("{prevYear}〜{nextYear}", { prevYear: cards[i - 1].year, nextYear: cards[i].year });
  };

  return (
    <div
      ref={viewportRef}
      className="pc-viewport"
      role="listbox"
      aria-label={t("配置位置を選ぶ")}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={trackRef}
        className="pc-track"
        style={{ perspective: `${PERSPECTIVE_PX}px` }}
      >
        {Array.from({ length: itemCount }, (_, i) => {
          const label = labelFor(i);
          return (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className={selectedSlot === i ? "pc-item pc-chosen" : "pc-item"}
              role="option"
              aria-selected={selectedSlot === i}
              aria-label={label}
              style={{ width: BASE_WIDTH }}
              onClick={() => snapTo(i)}
            >
              <div className="pc-card tl-card mystery">
                <div className="q">★</div>
                <div className="pc-label tiny">{label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
