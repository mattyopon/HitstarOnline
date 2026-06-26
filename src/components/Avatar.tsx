"use client";

/**
 * Circular avatar: the image when present, otherwise the name's first letter.
 * All sizing/shape comes from CSS (no inline dimensions) so it stays identical
 * everywhere. Pass `size` for the standard `.avatar` variants, or a full
 * `className` (e.g. "danmaku-avatar" / "chat-avatar") for the bespoke styles.
 */
export function Avatar({
  name,
  url,
  size,
  className,
}: {
  name: string;
  url?: string | null;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
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
