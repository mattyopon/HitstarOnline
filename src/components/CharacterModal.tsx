"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import type { Character } from "@/lib/gachaChars";
import { RARITY_STARS } from "@/lib/rarity";

/**
 * Character detail dialog (DESIGN_SPEC.md Roster / mock `.modal`): portrait,
 * name/jp name, era/attribute/rarity chips, level, ATK/DEF/SPD stats, quote,
 * and (mock `.modal .actions`) party add/remove actions for owned muses.
 *
 * Basic accessibility: `role="dialog"` + `aria-modal`, closes on Escape or
 * backdrop click, and traps Tab focus within the dialog while open (a
 * lightweight hand-rolled trap — no new dependency — since there's no
 * existing modal/focus-trap utility in the codebase to reuse yet).
 */
export function CharacterModal({
  character,
  owned,
  inParty = false,
  partyFull = false,
  partyBusy = false,
  onAddToParty,
  onRemoveFromParty,
  onClose,
}: {
  character: Character;
  /** Whether the caller's account owns this muse (Roster passes this through). */
  owned: boolean;
  /** Whether this muse currently occupies one of the 5 party slots. */
  inParty?: boolean;
  /** True when all 5 party slots are filled (and this muse isn't one of them). */
  partyFull?: boolean;
  /** True while a party add/remove request is in flight (disables the buttons). */
  partyBusy?: boolean;
  /** Omit to hide the party actions entirely (e.g. no party API wired by the caller). */
  onAddToParty?: () => void;
  onRemoveFromParty?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Escape-to-close + Tab focus trap while the dialog is open.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const stars = "★".repeat(RARITY_STARS[character.rarity]);
  const titleId = `char-modal-title-${character.id}`;

  return (
    <div
      className="char-modal-back"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="char-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <div className="left">
          <span
            className="rar-tag"
            style={{
              background:
                character.rarity === "SSR"
                  ? "linear-gradient(180deg, var(--ssr-a), var(--ssr-b))"
                  : character.rarity === "SR"
                    ? "linear-gradient(180deg, var(--sr-a), var(--sr-b))"
                    : "linear-gradient(180deg, var(--r-a), var(--r-b))",
            }}
          >
            {character.rarity}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={character.img}
            alt={character.nm}
            style={owned ? undefined : { filter: "grayscale(1) brightness(0.6)" }}
          />
        </div>
        <div className="right">
          <button type="button" className="close" onClick={onClose} aria-label={t("閉じる")} ref={closeBtnRef}>
            ×
          </button>
          <h2 className="nm" id={titleId}>
            {character.nm}
          </h2>
          <div className="jp">{character.jp}</div>
          <div className="meta-row">
            <span>{character.era}</span>
            <span>{character.attr}</span>
            <span>
              {t("LV")} {character.lv}
            </span>
            <span className="stars" aria-label={`${t("レアリティ")}: ${character.rarity}`}>
              {stars}
            </span>
          </div>
          <p className="quote">“{character.quote}”</p>
          <div className="stats">
            <div className="stat">
              <div className="k">{t("ATK")}</div>
              <div className="v">{character.atk}</div>
            </div>
            <div className="stat">
              <div className="k">{t("DEF")}</div>
              <div className="v">{character.def}</div>
            </div>
            <div className="stat">
              <div className="k">{t("SPD")}</div>
              <div className="v">{character.spd}</div>
            </div>
          </div>
          {!owned && <p className="locked-note">{t("未所持：ガチャで入手しよう")}</p>}
          {owned && (onAddToParty || onRemoveFromParty) && (
            <div className="actions">
              {inParty ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={onRemoveFromParty}
                  disabled={partyBusy || !onRemoveFromParty}
                >
                  {partyBusy ? t("処理中…") : t("パーティから外す")}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={onAddToParty}
                  disabled={partyBusy || partyFull || !onAddToParty}
                >
                  {partyBusy ? t("処理中…") : partyFull ? t("パーティが満員です") : t("パーティに編成")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
