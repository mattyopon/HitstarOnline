"use client";

/**
 * Circular avatar: the image when present, otherwise the name's first letter.
 * All sizing/shape comes from CSS (no inline dimensions) so it stays identical
 * everywhere. Pass `size` for the standard `.avatar` variants, or a full
 * `className` (e.g. "danmaku-avatar" / "chat-avatar") for the bespoke styles.
 *
 * Pass `image` (a character portrait URL, e.g. the player's equipped gacha
 * muse) to render the BILIBILI `.av-circle` rotating-gradient-ring variant
 * instead — used for the player's own card in Lobby/Battle headers. This is
 * purely additive: every existing caller that only passes `name`/`url` keeps
 * rendering the original `.avatar` markup untouched.
 */
export function Avatar({
  name,
  url,
  size,
  className,
  image,
}: {
  name: string;
  url?: string | null;
  size?: "xs" | "sm" | "md";
  className?: string;
  image?: string | null;
}) {
  if (image) {
    return (
      <span className={"av-circle" + (className ? ` ${className}` : "")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" />
      </span>
    );
  }
  const cls = className ?? "avatar" + (size ? ` avatar--${size}` : "");
  return (
    <span className={cls}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
