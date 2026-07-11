"use client";

import { useT } from "@/lib/i18n";
import type { PlayerGems } from "@/lib/gachaTypes";

/**
 * BILIBILI-style resource pill row (DESIGN_SPEC.md "Lobby" / mock .resource-bar):
 * 💎 gems / 🎵 notes / 🪙 tokens. Purely a display component — the caller owns
 * fetching (GameRoom/Lobby pattern: GET /api/character/list → { gems, ... }).
 *
 * Loading/zero-state safe: pass `gems={null}` while loading (renders "—"
 * placeholders instead of a flash of 0), and a resolved `PlayerGems` (or the
 * all-zero default the API already returns for brand-new players) once ready.
 */
export function ResourceBar({ gems, loading }: { gems: PlayerGems | null; loading?: boolean }) {
  const t = useT();

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="resource-bar" role="group" aria-label={t("所持リソース")}>
      <ResPill icon="💎" label={t("GEMS")} value={gems ? fmt(gems.gems) : null} loading={loading} />
      <ResPill icon="🎵" label={t("NOTES")} value={gems ? fmt(gems.notes) : null} loading={loading} />
      <ResPill icon="🪙" label={t("TOKENS")} value={gems ? fmt(gems.tokens) : null} loading={loading} />
    </div>
  );
}

function ResPill({
  icon,
  label,
  value,
  loading,
}: {
  icon: string;
  label: string;
  value: string | null;
  loading?: boolean;
}) {
  return (
    <div className="res">
      <span className="ic" aria-hidden>
        {icon}
      </span>
      <span className="v">
        {loading ? <span className="spin-loader res-loader" aria-hidden /> : (value ?? "0")}
        <small>{label}</small>
      </span>
    </div>
  );
}
