"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { GACHA_CHARS, type Character, type Era, type Rarity } from "@/lib/gachaChars";
import { RARITY_STARS } from "@/lib/rarity";
import { api } from "@/lib/clientApi";
import type { CharacterListResponse, PlayerParty } from "@/lib/gachaTypes";
import { CharacterModal } from "./CharacterModal";

const ERAS: Era[] = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
type Filter = "all" | Rarity | Era;

/**
 * One-shot fetch of the caller's owned roster + party (GET /api/character/list),
 * mirroring the exact fetch/error-handling convention already established in
 * Lobby.tsx's `useGachaSummary()`: loading/error never crash the screen —
 * on failure (e.g. this design-review branch's migration 0006 not applied to
 * a real database yet) we fall back to an empty owned-set/empty party so every
 * tile renders in its locked/preview state instead of throwing.
 */
function useOwnedCharacters() {
  const [data, setData] = useState<CharacterListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/character/list")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as CharacterListResponse;
      })
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active) setErrored(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    characters: data?.characters ?? [],
    party: data?.party ?? null,
    setParty: (updater: (prev: PlayerParty | null) => PlayerParty) =>
      setData((prev) => (prev ? { ...prev, party: updater(prev.party) } : prev)),
    loading,
    errored,
  };
}

/**
 * Roster screen (DESIGN_SPEC.md "Roster" / mock `.screen-roster`): header with
 * TOTAL/SSR/SR/R counters, ALL/rarity/era filter chips, and a 5-col×3-row
 * grid of all 15 muses as `.ctile` cards. Ownership (locked vs. unlocked)
 * comes from GET /api/character/list; if that call fails or the account has
 * no rows yet, every tile renders informationally in its locked state rather
 * than crashing — this is expected pre-migration-0006 behavior on this
 * design-review branch.
 */
export function Roster({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const { characters: owned, party, setParty, loading } = useOwnedCharacters();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Character | null>(null);
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyErr, setPartyErr] = useState<string | null>(null);

  const ownedIds = useMemo(() => new Set(owned.map((c) => c.characterId)), [owned]);

  const partySlots = party ?? [null, null, null, null, null];
  const partySlotOf = useCallback(
    (id: string) => partySlots.findIndex((cid) => cid === id),
    [partySlots],
  );
  const emptySlotIndex = partySlots.findIndex((cid) => cid === null);

  const addToParty = useCallback(
    async (id: string) => {
      if (emptySlotIndex === -1 || partyBusy) return;
      setPartyBusy(true);
      setPartyErr(null);
      try {
        await api("/api/party/set", { slot: emptySlotIndex, characterId: id });
        setParty((prev) => {
          const next = (prev ?? [null, null, null, null, null]).slice();
          next[emptySlotIndex] = id;
          return next;
        });
      } catch (e) {
        setPartyErr(e instanceof Error ? e.message : t("パーティ編成に失敗しました"));
      } finally {
        setPartyBusy(false);
      }
    },
    [emptySlotIndex, partyBusy, setParty, t],
  );

  const removeFromParty = useCallback(
    async (id: string) => {
      const slot = partySlotOf(id);
      if (slot === -1 || partyBusy) return;
      setPartyBusy(true);
      setPartyErr(null);
      try {
        await api("/api/party/set", { slot, characterId: null });
        setParty((prev) => {
          const next = (prev ?? [null, null, null, null, null]).slice();
          next[slot] = null;
          return next;
        });
      } catch (e) {
        setPartyErr(e instanceof Error ? e.message : t("パーティ編成に失敗しました"));
      } finally {
        setPartyBusy(false);
      }
    },
    [partySlotOf, partyBusy, setParty, t],
  );

  const counts = useMemo(() => {
    const total = GACHA_CHARS.length;
    const bucket = (r: Rarity) => GACHA_CHARS.filter((c) => c.rarity === r).length;
    return { total, ssr: bucket("SSR"), sr: bucket("SR"), r: bucket("R") };
  }, []);

  const eraCounts = useMemo(() => {
    const m = new Map<Era, number>();
    for (const era of ERAS) m.set(era, GACHA_CHARS.filter((c) => c.era === era).length);
    return m;
  }, []);

  const ownedCount = useMemo(() => {
    const ownedChars = GACHA_CHARS.filter((c) => ownedIds.has(c.id));
    return {
      total: ownedChars.length,
      ssr: ownedChars.filter((c) => c.rarity === "SSR").length,
      sr: ownedChars.filter((c) => c.rarity === "SR").length,
      r: ownedChars.filter((c) => c.rarity === "R").length,
    };
  }, [ownedIds]);

  const list = useMemo(() => {
    if (filter === "all") return GACHA_CHARS;
    return GACHA_CHARS.filter((c) => c.rarity === filter || c.era === filter);
  }, [filter]);

  const rarityLabel = (r: Rarity) => (r === "SSR" ? t("SSR") : r === "SR" ? t("SR") : t("R"));

  return (
    <div className="screen-roster-inner">
      <div className="roster-hero">
        <div>
          <h1 className="ttl">
            {t("キャラクター図鑑")}
            <small>{t("あなたのコレクション") + " · " + t("{n} muses", { n: GACHA_CHARS.length })}</small>
          </h1>
        </div>
        <div className="roster-stats" role="group" aria-label={t("所持状況")}>
          <div className="roster-stat">
            <div className="k">{t("TOTAL")}</div>
            <div className="v">{loading ? "—" : `${ownedCount.total}/${counts.total}`}</div>
          </div>
          <div className="roster-stat ssr">
            <div className="k">{t("SSR")}</div>
            <div className="v">{loading ? "—" : `${ownedCount.ssr}/${counts.ssr}`}</div>
          </div>
          <div className="roster-stat sr">
            <div className="k">{t("SR")}</div>
            <div className="v">{loading ? "—" : `${ownedCount.sr}/${counts.sr}`}</div>
          </div>
          <div className="roster-stat r">
            <div className="k">{t("R")}</div>
            <div className="v">{loading ? "—" : `${ownedCount.r}/${counts.r}`}</div>
          </div>
        </div>
        {onClose && (
          <button type="button" className="btn outline sm" onClick={onClose}>
            {t("閉じる")}
          </button>
        )}
      </div>

      <div className="roster-filter" role="group" aria-label={t("フィルター")}>
        <button
          type="button"
          className={"fchip" + (filter === "all" ? " on" : "")}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          {t("ALL")} · {counts.total}
        </button>
        {(["SSR", "SR", "R"] as Rarity[]).map((r) => (
          <button
            key={r}
            type="button"
            className={"fchip " + r.toLowerCase() + (filter === r ? " on" : "")}
            aria-pressed={filter === r}
            onClick={() => setFilter(r)}
          >
            {rarityLabel(r)} · {counts[r.toLowerCase() as "ssr" | "sr" | "r"]}
          </button>
        ))}
        {ERAS.map((era) => (
          <button
            key={era}
            type="button"
            className={"fchip" + (filter === era ? " on" : "")}
            aria-pressed={filter === era}
            onClick={() => setFilter(era)}
          >
            {era} · {eraCounts.get(era) ?? 0}
          </button>
        ))}
      </div>

      <div className="roster-grid">
        {list.map((c) => {
          const isOwned = ownedIds.has(c.id);
          const stars = "★".repeat(RARITY_STARS[c.rarity]);
          return (
            <button
              key={c.id}
              type="button"
              className={"ctile roster-tile " + c.rarity.toLowerCase() + (isOwned ? "" : " locked")}
              onClick={() => setSelected(c)}
              aria-label={`${c.nm} (${c.jp}) — ${rarityLabel(c.rarity)}${isOwned ? "" : `, ${t("未所持")}`}`}
            >
              <div className="portrait" style={{ backgroundImage: `url(${c.img})`, backgroundPosition: c.focus }} />
              <span className="ctile-rarity-tag">{c.rarity}</span>
              <span className="era-tag">{c.era}</span>
              <span className="attr-tag">{c.attr}</span>
              <div className="info">
                <div className="nm">{c.nm}</div>
                <div className="jp">{c.jp}</div>
                <div className="stars" aria-hidden>
                  {stars}
                </div>
                <div className="lvl">
                  <span>{t("LV")}</span>
                  <span className="v">{isOwned ? c.lv : "?"}</span>
                </div>
              </div>
              {!isOwned && (
                <span className="lock-badge" aria-hidden>
                  🔒
                </span>
              )}
              {isOwned && partySlotOf(c.id) !== -1 && (
                <span className="party-badge" aria-hidden>
                  ▸ {t("PARTY")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {partyErr && (
        <p className="error" role="alert">
          {partyErr}
        </p>
      )}

      {selected && (
        <CharacterModal
          character={selected}
          owned={ownedIds.has(selected.id)}
          inParty={partySlotOf(selected.id) !== -1}
          partyFull={emptySlotIndex === -1}
          partyBusy={partyBusy}
          onAddToParty={() => addToParty(selected.id)}
          onRemoveFromParty={() => removeFromParty(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
