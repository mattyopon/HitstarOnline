"use client";

import { useT } from "@/lib/i18n";
import { GACHA_CHARS } from "@/lib/gachaChars";
import type { PlayerParty } from "@/lib/gachaTypes";

const CHAR_BY_ID = new Map(GACHA_CHARS.map((c) => [c.id, c]));

/**
 * Lobby "MY PARTY" strip (DESIGN_SPEC.md Lobby / mock .party-strip): 5 mini
 * character portraits (or an empty-slot placeholder), rarity-tinted border +
 * flag, plus an edit affordance. `party` is the 5-slot array from
 * GET /api/character/list (null = empty slot); loading/zero-state safe —
 * renders 5 empty slots while `party` is null (e.g. before the API call
 * resolves, or on this design-review branch before migration 0006 is applied).
 */
export function PartyStrip({
  party,
  onEdit,
}: {
  party: PlayerParty | null;
  onEdit?: () => void;
}) {
  const t = useT();
  const slots = party ?? [null, null, null, null, null];

  return (
    <div className="party-strip">
      <span className="lbl">▸ {t("MY PARTY")} ▸</span>
      <div className="row" role="list" aria-label={t("パーティ編成")}>
        {slots.map((characterId, i) => {
          const char = characterId ? CHAR_BY_ID.get(characterId) : undefined;
          return (
            <div
              key={i}
              role="listitem"
              className={"av" + (char ? ` ${char.rarity.toLowerCase()}` : " empty")}
              style={char ? { backgroundImage: `url(${char.img})`, backgroundPosition: char.focus } : undefined}
              title={char ? char.nm : t("空きスロット")}
            >
              {char ? (
                <span className="rar">{char.rarity}</span>
              ) : (
                <span className="party-strip-empty-mark" aria-hidden>
                  ＋
                </span>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="edit" onClick={onEdit}>
        {t("編成")} ▸
      </button>
    </div>
  );
}
