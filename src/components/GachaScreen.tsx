"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Rarity ordering so the reveal knows which pull is the "best" one (used to
// stamp the strongest burst on the highest-rarity card).
const RARITY_RANK: Record<Rarity, number> = { R: 0, SR: 1, SSR: 2 };

/**
 * Detect the "reduce motion" accessibility preference once on mount so the
 * reveal can fall back to an instant, animation-free presentation. CSS already
 * disables the keyframes under `@media (prefers-reduced-motion: reduce)`; this
 * hook mirrors that in JS so the sequential *timing* (setTimeout cascade) is
 * skipped too — otherwise reduced-motion users would still wait out the delays.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return reduced;
}

/**
 * Full-screen gacha reveal overlay (DESIGN_SPEC.md "Gacha" — upgrades the plain
 * result list into a proper summon reveal). Each pulled card starts face-down
 * and flips open one-by-one in a staggered cascade, each with a rarity-colored
 * glow/burst (SSR gold-orange / SR purple / R blue via the --ssr/--sr/--r
 * tokens). Skip reveals everything at once; OK/Close returns to the gacha screen
 * with the (already-updated) gem count. Under prefers-reduced-motion the cascade
 * timing and flip animation are both skipped — every card renders instantly.
 */
function RevealOverlay({
  results,
  onClose,
  reduced,
}: {
  results: GachaRollResultItem[];
  onClose: () => void;
  reduced: boolean;
}) {
  const t = useT();
  const stars = (r: Rarity) => "★".repeat(RARITY_STARS[r]);
  const rarityLabel = (r: Rarity) => (r === "SSR" ? t("SSR") : r === "SR" ? t("SR") : t("R"));

  // How many cards have been flipped face-up so far. Under reduced motion we
  // reveal all at once; otherwise a cascade advances one card at a time.
  const [revealed, setRevealed] = useState(reduced ? results.length : 0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const revealAll = useCallback(() => {
    clearTimers();
    setRevealed(results.length);
  }, [clearTimers, results.length]);

  useEffect(() => {
    if (reduced) return; // instant reveal, no cascade
    // Stagger: first card lands quickly, then ~230ms between each. Total for a
    // x10 stays comfortably under ~2.5s so "Skip" is a shortcut, not a rescue.
    const step = 230;
    for (let i = 0; i < results.length; i++) {
      timers.current.push(
        setTimeout(() => setRevealed((n) => Math.max(n, i + 1)), 120 + i * step),
      );
    }
    return clearTimers;
  }, [reduced, results.length, clearTimers]);

  // Index of the highest-rarity pull — gets the amplified burst treatment.
  const bestIndex = useMemo(() => {
    let best = 0;
    for (let i = 1; i < results.length; i++) {
      if (RARITY_RANK[results[i].rarity] > RARITY_RANK[results[best].rarity]) best = i;
    }
    return best;
  }, [results]);

  const allRevealed = revealed >= results.length;
  const multi = results.length > 1;

  return (
    <div
      className="gacha-reveal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("召喚結果")}
    >
      <div className="gacha-reveal-backdrop" aria-hidden />
      <div className="gacha-reveal-head">
        <div className="eb">★ {t("SUMMON")} ★</div>
        <h3>{t("召喚結果")}</h3>
      </div>

      <div
        className={"gacha-reveal-cards" + (multi ? " multi" : " single")}
        role="list"
        aria-live="polite"
      >
        {results.map((r, i) => {
          const c = CHAR_BY_ID.get(r.characterId);
          const isFace = i < revealed;
          const cls =
            "gacha-reveal-card ctile " +
            r.rarity.toLowerCase() +
            (isFace ? " is-face" : "") +
            (i === bestIndex ? " is-best" : "");
          const label = `${c?.nm ?? r.characterId} — ${rarityLabel(r.rarity)}${
            r.isNew ? `, ${t("NEW")}` : ""
          }`;
          return (
            <div key={`${r.characterId}-${i}`} className={cls} role="listitem" aria-label={label}>
              <div className="gacha-reveal-inner">
                <div className="gacha-reveal-back" aria-hidden>
                  <span className="q">?</span>
                </div>
                <div className="gacha-reveal-front" aria-hidden={!isFace}>
                  <span className="gacha-reveal-burst" aria-hidden />
                  {c && (
                    <div
                      className="portrait"
                      style={{ backgroundImage: `url(${c.img})`, backgroundPosition: c.focus }}
                    />
                  )}
                  <span className="ctile-rarity-tag">{r.rarity}</span>
                  {r.isNew && <span className="gacha-reveal-new">{t("NEW")}</span>}
                  <div className="info">
                    <div className="nm">{c?.nm ?? r.characterId}</div>
                    <div className="stars" aria-hidden>
                      {stars(r.rarity)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="gacha-reveal-actions">
        {!allRevealed && (
          <button type="button" className="btn outline sm" onClick={revealAll}>
            {t("スキップ")}
          </button>
        )}
        <button
          type="button"
          className="btn sm gacha-reveal-ok"
          onClick={onClose}
          disabled={!allRevealed}
        >
          {t("OK")}
        </button>
      </div>
    </div>
  );
}

/**
 * Gacha screen (DESIGN_SPEC.md "Gacha" / mock `.screen-gacha`): banner header,
 * center pickup art with flanking mini cards, a rates panel, and the
 * ×1 / ×10 / FREE pull buttons wired to POST /api/gacha/roll and
 * POST /api/gacha/daily-pull. On a successful roll the results are handed to a
 * full-screen {@link RevealOverlay} (flip-and-burst summon reveal). Everything
 * degrades gracefully before migration 0006 is applied (errors surface inline
 * and never crash the screen).
 */
export function GachaScreen({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const { gems, setGems, loading: gemsLoading } = useGems();
  const reduced = usePrefersReducedMotion();
  const [busy, setBusy] = useState<"single" | "multi" | "daily" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<GachaRollResultItem[] | null>(null);
  // Monotonic pull id → forces the reveal overlay to remount (fresh cascade)
  // for each successful roll, even back-to-back.
  const [pullSeq, setPullSeq] = useState(0);

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
      setGems((prev) => (prev ? { ...prev, gems: res.gemsRemaining } : prev));
      if (res.results.length > 0) {
        setResults(res.results);
        setPullSeq((n) => n + 1);
      }
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

      {results && (
        <RevealOverlay
          key={pullSeq}
          results={results}
          reduced={reduced}
          onClose={() => setResults(null)}
        />
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
