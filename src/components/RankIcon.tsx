"use client";

import { isTier, tierColor, tierIndex, tierLabel, type Tier } from "@/lib/rank";
import { useT } from "@/lib/i18n";

export interface RankIconProps {
  tier?: string | null;
  size?: number; // px, default 20
}

/**
 * Original per-tier emblem art (not derived from any existing game's icons).
 * Each tier is a distinct geometric badge; shine/sparkle/glow intensity scales
 * with the tier index (wood = static, challenger = brightest animated glow +
 * sparkles). Renders nothing for guests/bots/casual (undefined/invalid tier).
 */
export function RankIcon({ tier, size = 20 }: RankIconProps) {
  const tr = useT();
  if (!isTier(tier)) return null;
  const t = tier as Tier;
  const idx = tierIndex(t); // 0..6
  const color = tierColor(t);
  const glow = size * idx * 0.06; // drop-shadow blur, PROPORTIONAL to icon size
  const animate = idx >= 3; // platinum+ animate
  const dur = (3 - idx * 0.3).toFixed(2); // faster shimmer for higher tiers
  const uid = `rk_${t}`;

  return (
    <span
      title={tr(tierLabel(t))}
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        lineHeight: 0,
        verticalAlign: "middle",
        flex: "0 0 auto",
        // Glow lives on the wrapper so it never fights the svg's brightness
        // animation (both are `filter`) — keeps the icon's footprint constant.
        filter: `drop-shadow(0 0 ${glow}px ${color})`,
      }}
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className={animate ? "rank-shine" : undefined}
        style={{ display: "block", flex: "0 0 auto", ["--rk-dur" as string]: `${dur}s` }}
      >
        <defs>
          <linearGradient id={`${uid}_g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={lighten(color)} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <Emblem tier={t} grad={`url(#${uid}_g)`} color={color} />
        {idx >= 4 && <Sparkles color="#ffffff" />}
      </svg>
    </span>
  );
}

function Emblem({ tier, grad, color }: { tier: Tier; grad: string; color: string }) {
  const stroke = "#2a2a2a";
  switch (tier) {
    case "wood": // rough slab (octagon)
      return (
        <polygon
          points="24,6 38,12 42,26 36,40 24,44 12,40 6,26 10,12"
          fill={grad}
          stroke={stroke}
          strokeWidth="2"
        />
      );
    case "bronze": // pentagon shield
      return <polygon points="24,5 42,18 35,42 13,42 6,18" fill={grad} stroke={stroke} strokeWidth="2" />;
    case "silver": // hexagon + ring
      return (
        <>
          <polygon points="24,5 41,15 41,33 24,43 7,33 7,15" fill={grad} stroke={stroke} strokeWidth="2" />
          <circle cx="24" cy="24" r="9" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.7" />
        </>
      );
    case "platinum": // rounded square + inner diamond
      return (
        <>
          <rect x="7" y="7" width="34" height="34" rx="8" fill={grad} stroke={stroke} strokeWidth="2" />
          <polygon points="24,13 33,24 24,35 15,24" fill="#fff" opacity="0.5" />
        </>
      );
    case "diamond": // faceted rhombus
      return (
        <>
          <polygon points="24,3 43,24 24,45 5,24" fill={grad} stroke={color} strokeWidth="2" />
          <polygon points="24,11 35,24 24,37 13,24" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.8" />
        </>
      );
    case "grandmaster": // crowned disc
      return (
        <>
          <circle cx="24" cy="26" r="18" fill={grad} stroke={color} strokeWidth="2" />
          <path d="M10 18 L17 24 L24 12 L31 24 L38 18 L35 32 L13 32 Z" fill="#fff" opacity="0.85" />
        </>
      );
    case "challenger": // 8-point star burst
      return (
        <polygon
          points="24,2 29,17 44,12 33,24 44,36 29,31 24,46 19,31 4,36 15,24 4,12 19,17"
          fill={grad}
          stroke={color}
          strokeWidth="2"
        />
      );
  }
}

function Sparkles({ color }: { color: string }) {
  return (
    <g className="rank-sparkle" fill={color}>
      <circle cx="12" cy="10" r="1.6" />
      <circle cx="38" cy="14" r="1.2" />
      <circle cx="34" cy="38" r="1.5" />
    </g>
  );
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + 60);
  const g = Math.min(255, ((n >> 8) & 255) + 60);
  const b = Math.min(255, (n & 255) + 60);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
