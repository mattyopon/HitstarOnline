"use client";

import { useT } from "@/lib/i18n";

/**
 * Lobby "LIVE" danmaku marquee (DESIGN_SPEC.md Lobby / mock .danmu-strip).
 * Reuses the `.danmu-strip` / `.marquee` / `@keyframes danmu-strip-scroll`
 * recipe already defined in globals.css (added alongside the other BILIBILI
 * component classes) — that CSS already includes the
 * `prefers-reduced-motion: reduce` override that freezes the scroll and lays
 * the text out statically, so this component only needs to provide markup.
 *
 * `messages` defaults to a placeholder line of flavor danmaku (translated via
 * t()) when the caller doesn't have anything live yet (e.g. no chat backlog
 * wired into the Lobby).
 */
export function DanmuStrip({ messages }: { messages?: string[] }) {
  const t = useT();
  const items = messages && messages.length > 0 ? messages : [t("♪ ようこそ Hitstar Online へ！")];
  // The marquee scrolls one continuous line; join with a bullet separator to
  // match the mock's single-<span> "ticker" look.
  const line = items.join("　│　");

  return (
    <div className="danmu-strip">
      <span className="live">{t("LIVE")}</span>
      <div className="marquee">
        <span>{line}</span>
      </div>
    </div>
  );
}
