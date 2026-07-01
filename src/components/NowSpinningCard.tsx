"use client";

import { GACHA_CHARS } from "@/lib/gachaChars";
import { RARITY_STARS } from "@/lib/rarity";
import { useT } from "@/lib/i18n";

// Purely-decorative "Now Spinning" side card (mock .enemy-card). There is NO
// per-player character on the server, so the muse is derived deterministically
// from a cosmetic seed (the active player's name) — it never carries any
// answer/game data. It is a static, framing visual only.
function decoMuse(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return GACHA_CHARS[Math.abs(h) % GACHA_CHARS.length];
}

/** Decorative BILIBILI-style "Now Spinning" muse card shown beside the stage.
 *  Cosmetic only — `seed` picks the muse, `live` toggles the pulsing dot. */
export function NowSpinningCard({ seed, live }: { seed: string; live: boolean }) {
  const t = useT();
  const muse = decoMuse(seed || "hitstar");
  const stars = "★ ".repeat(RARITY_STARS[muse.rarity]).trim();
  return (
    <div className="enemy-card" aria-hidden="true">
      <div className="head">
        <div className="ttl">
          {live && <span className="live-dot" />} {t("NOW SPINNING")}
        </div>
        <div className="nm">{muse.jp}</div>
        <span className="era">
          {muse.era} · {muse.attr}
        </span>
        <div className="stars">{stars}</div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="portrait" src={muse.img} alt="" />
      <div className="stats-mini">
        <div className="stat-mini">
          <div className="k">{t("ATK")}</div>
          <div className="v">{muse.atk}</div>
        </div>
        <div className="stat-mini">
          <div className="k">{t("DEF")}</div>
          <div className="v">{muse.def}</div>
        </div>
        <div className="stat-mini">
          <div className="k">{t("SPD")}</div>
          <div className="v">{muse.spd}</div>
        </div>
      </div>
    </div>
  );
}
