"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { GACHA_CHARS, type Rarity } from "@/lib/gachaChars";
import { RARITY_STARS, RARITY_RATES, PITY_THRESHOLD, PICKUP_RATE } from "@/lib/rarity";
import { DEFAULT_BANNER } from "@/lib/gachaRoll";
import { api } from "@/lib/clientApi";
import type { CharacterListResponse, GachaRollResponse, GachaRollResultItem, PlayerGems } from "@/lib/gachaTypes";

const PICKUP_CHAR = GACHA_CHARS.find((c) => c.id === DEFAULT_BANNER.pickupCharacterId) ?? GACHA_CHARS[0];

// Flanking "jacket card" minis either side of the pickup (mock
// .gacha-side-chars left/right — 3 each). Pulled from the roster excluding
// the pickup itself; order/picks are cosmetic only, no gameplay meaning.
const SIDE_LEFT = GACHA_CHARS.filter((c) => c.id !== PICKUP_CHAR.id).slice(0, 3);
const SIDE_RIGHT = GACHA_CHARS.filter((c) => c.id !== PICKUP_CHAR.id).slice(3, 6);

const ROLL_COST: Record<1 | 10, number> = { 1: 160, 10: 1440 };

/**
 * One-shot fetch of the caller's gacha resources (GET /api/character/list),
 * mirroring the exact fetch/error-handling convention established in
 * Lobby.tsx's `useGachaSummary()` / Roster.tsx's `useOwnedCharacters()`:
 * loading/error never crash the screen — on failure (e.g. this design-review
 * branch's migration 0006 not applied to a real database yet) we fall back to
 * a null gems state so the screen renders "—" placeholders instead of throwing.
 */
function useGems() {
  const [gems, setGems] = useState<PlayerGems | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/character/list")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as CharacterListResponse;
      })
      .then((d) => {
        if (active) setGems(d.gems);
      })
      .catch(() => {
        /* expected pre-migration-0006 on this design-review branch */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { gems, setGems, loading };
}

const CHAR_BY_ID = new Map(GACHA_CHARS.map((c) => [c.id, c]));

/**
 * Gacha screen (DESIGN_SPEC.md "Gacha" / mock `.screen-gacha`): banner header,
 * center pickup art with flanking mini cards, a rates panel, and the
 * ×1 / ×10 / FREE pull buttons wired to POST /api/gacha/roll and
 * POST /api/gacha/daily-pull. Pull animation is intentionally minimal (a
 * simple result list/reveal) per the task's lowest-priority note — the
 * important part is the buttons working end-to-end against the real API
 * shape and degrading gracefully before migration 0006 is applied.
 */
export function GachaScreen({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const { gems, setGems, loading: gemsLoading } = useGems();
  const [busy, setBusy] = useState<"single" | "multi" | "daily" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<GachaRollResultItem[] | null>(null);

  const rarityLabel = (r: Rarity) => (r === "SSR" ? t("SSR") : r === "SR" ? t("SR") : t("R"));
  const stars = (r: Rarity) => "★".repeat(RARITY_STARS[r]);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  async function doRoll(kind: "single" | "multi" | "daily") {
    if (busy) return;
    setBusy(kind);
    setErr(null);
    try {
      const res =
        kind === "daily"
          ? await api<GachaRollResponse>("/api/gacha/daily-pull", { banner: DEFAULT_BANNER.id })
          : await api<GachaRollResponse>("/api/gacha/roll", {
              count: kind === "multi" ? 10 : 1,
              banner: DEFAULT_BANNER.id,
            });
      setResults(res.results);
      setGems((prev) => (prev ? { ...prev, gems: res.gemsRemaining } : prev));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("ガチャに失敗しました"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="screen-gacha-inner">
      {onClose && (
        <button type="button" className="btn outline sm gacha-close" onClick={onClose}>
          {t("閉じる")}
        </button>
      )}

      <div className="gacha-head">
        <div className="eb">★ {t("FEATURED SUMMON")} ★</div>
        <h2 className="title-logo-text">{DEFAULT_BANNER.name}</h2>
        <div className="banner-name">
          {stars("SSR")} {PICKUP_CHAR.nm} {t("ピックアップ")}
        </div>
      </div>

      <div className="gacha-stage">
        <div className="feat-display">
          <div className="gacha-side-chars left" aria-hidden>
            {SIDE_LEFT.map((c) => (
              <div key={c.id} className="mini" style={{ backgroundImage: `url(${c.img})`, backgroundPosition: c.focus }} />
            ))}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="feat-art" src={PICKUP_CHAR.img} alt={PICKUP_CHAR.nm} style={{ objectPosition: PICKUP_CHAR.focus }} />
          <div className="gacha-side-chars right" aria-hidden>
            {SIDE_RIGHT.map((c) => (
              <div key={c.id} className="mini" style={{ backgroundImage: `url(${c.img})`, backgroundPosition: c.focus }} />
            ))}
          </div>
        </div>

        <div className="rates">
          <div className="rates-card panel" id="gacha-rates-disclosure">
            <h4>{t("排出確率")}</h4>
            <div className="rate ssr">
              <span className="lbl">
                {t("SSR")} <span className="stars">{stars("SSR")}</span>
              </span>
              <span className="pct">{pct(RARITY_RATES.SSR)}</span>
            </div>
            <div className="rate sr">
              <span className="lbl">
                {t("SR")} <span className="stars">{stars("SR")}</span>
              </span>
              <span className="pct">{pct(RARITY_RATES.SR)}</span>
            </div>
            <div className="rate r">
              <span className="lbl">
                {t("R")} <span className="stars">{stars("R")}</span>
              </span>
              <span className="pct">{pct(RARITY_RATES.R)}</span>
            </div>
            <div className="rates-note">
              {t("天井: {n}回までに★★★★★確定", { n: PITY_THRESHOLD + 1 })}
              <br />
              {t("{pct}でピックアップ確定", { pct: pct(PICKUP_RATE) })}
            </div>
          </div>

          <div className="pickup">
            <div className="eb">▸ {t("PICKUP")} ▸</div>
            <div className="pn">{PICKUP_CHAR.nm}</div>
            <div className="pd">{PICKUP_CHAR.quote}</div>
          </div>
        </div>
      </div>

      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}

      {results && results.length > 0 && (
        <div className="gacha-results panel" role="status" aria-live="polite">
          <h4>{t("ガチャ結果")}</h4>
          <div className="gacha-results-grid">
            {results.map((r, i) => {
              const c = CHAR_BY_ID.get(r.characterId);
              const label = `${c?.nm ?? r.characterId} — ${rarityLabel(r.rarity)}${r.isNew ? `, ${t("NEW")}` : ""}`;
              return (
                <div
                  key={`${r.characterId}-${i}`}
                  className={"gacha-result-tile ctile " + r.rarity.toLowerCase()}
                  aria-label={label}
                >
                  {c && (
                    <div
                      className="portrait"
                      style={{ backgroundImage: `url(${c.img})`, backgroundPosition: c.focus }}
                    />
                  )}
                  <span className="ctile-rarity-tag">{r.rarity}</span>
                  {r.isNew && <span className="gacha-result-new">{t("NEW")}</span>}
                  <div className="info">
                    <div className="nm">{c?.nm ?? r.characterId}</div>
                    <div className="stars" aria-hidden>
                      {stars(r.rarity)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="pulls">
        <button type="button" className="pull-btn" onClick={() => doRoll("single")} disabled={!!busy}>
          <div className="n">×1</div>
          <div className="sub">{t("Single")}</div>
          <div className="cost">
            💎 {busy === "single" ? t("処理中…") : ROLL_COST[1].toLocaleString()}
          </div>
        </button>
        <button type="button" className="pull-btn featured" onClick={() => doRoll("multi")} disabled={!!busy}>
          <span className="best">{t("お得♡")}</span>
          <div className="n">×10</div>
          <div className="sub">{t("Multi")}</div>
          <div className="cost">
            💎 {busy === "multi" ? t("処理中…") : ROLL_COST[10].toLocaleString()}
          </div>
        </button>
        <button type="button" className="pull-btn" onClick={() => doRoll("daily")} disabled={!!busy}>
          <div className="n">FREE</div>
          <div className="sub">{t("Daily Pull")}</div>
          <div className="cost free">
            {busy === "daily" ? t("処理中…") : gemsLoading ? "—" : t("1日1回")}
          </div>
        </button>
      </div>

      <div className="gacha-current-gems">
        💎 {gemsLoading ? "—" : (gems?.gems ?? 0).toLocaleString()} {t("GEMS")}
      </div>

      <div className="gacha-foot">
        {t("排出確率は")} <a href="#gacha-rates-disclosure">{t("こちら")}</a>
      </div>
    </div>
  );
}
