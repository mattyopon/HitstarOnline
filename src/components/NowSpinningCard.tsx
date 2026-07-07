"use client";

import { CHAR_BY_ID, GACHA_CHARS } from "@/lib/gachaChars";
import { RARITY_STARS } from "@/lib/rarity";
import { useT } from "@/lib/i18n";

// FALLBACK muse pick when the current-turn player has no published leader
// (bot / legacy account): derived deterministically from a cosmetic seed (the
// active player's name) — it never carries any answer/game data. When
// `leaderCharacterId` IS available it wins, so unowned muses are never
// "spoiled" for players who actually have party data.
function decoMuse(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return GACHA_CHARS[Math.abs(h) % GACHA_CHARS.length];
}

/** BILIBILI-style "Now Spinning" muse card shown beside the stage. Shows the
 *  current-turn player's equipped leader as a spinning picture disc (art
 *  printed ON the vinyl); cosmetic only — `live` toggles spin + pulsing dot. */
export function NowSpinningCard({
  seed,
  live,
  leaderCharacterId,
}: {
  seed: string;
  live: boolean;
  /** Current-turn player's published leader id (PublicPlayer.leaderCharacterId). */
  leaderCharacterId?: string;
}) {
  const t = useT();
  const muse =
    (leaderCharacterId && CHAR_BY_ID.get(leaderCharacterId)) || decoMuse(seed || "hitstar");
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
      {/* Picture disc: muse face printed ON the record (clipped to the circle,
          grooves over the art, center label on top), spinning while live. */}
      <div className={"spin-disc" + (live ? " spinning" : "")} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="pdisc-art"
          src={muse.img}
          alt=""
          style={{ objectPosition: muse.focus }}
        />
        <span className="pdisc-grooves" />
        <span className="pdisc-label" />
      </div>
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
