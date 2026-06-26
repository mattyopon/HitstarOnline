"use client";

// ───────────────────────────────────────────────────────────────────────────
// Lightweight i18n. Keys ARE the Japanese source strings, so t("年表…") works
// with graceful fallback (untranslated keys render the Japanese). Translations
// live in locales.ts (generated). Locale is a tiny external store so any
// component using useT()/useLocale() re-renders when the language changes.
// ───────────────────────────────────────────────────────────────────────────
import { useCallback, useSyncExternalStore } from "react";
import { TRANSLATIONS } from "./locales";

export const LOCALES = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "简体中文" },
  { code: "ko", label: "한국어" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
] as const;
export type Locale = (typeof LOCALES)[number]["code"];

const CODES = LOCALES.map((l) => l.code) as string[];
const STORAGE_KEY = "hitstar_lang";

let current = "ja"; // SSR + first client render = ja (avoids hydration mismatch)
const subs = new Set<() => void>();

function emit() {
  subs.forEach((f) => f());
}
function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function getLocale(): string {
  return current;
}

export function setLocale(code: string) {
  if (!CODES.includes(code) || code === current) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
  emit();
}

/** Resolve the preferred locale from storage → browser → ja. Call after mount. */
export function detectLocale(): string {
  if (typeof window === "undefined") return "ja";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && CODES.includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "ja").toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  const base = nav.split("-")[0];
  return CODES.includes(base) ? base : "ja";
}

/** Initialize the locale from storage/browser once, after hydration. */
export function initLocale() {
  setLocale(detectLocale());
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function translate(
  locale: string,
  ja: string,
  vars?: Record<string, string | number>,
): string {
  const dict = TRANSLATIONS[locale];
  const base = (dict && dict[ja]) ?? ja; // Japanese is the implicit fallback
  return interpolate(base, vars);
}

/** Non-reactive translate (module/use outside React). */
export function t(ja: string, vars?: Record<string, string | number>): string {
  return translate(current, ja, vars);
}

/** Reactive current locale + setter. */
export function useLocale(): [string, (c: string) => void] {
  const loc = useSyncExternalStore(subscribe, getLocale, () => "ja");
  return [loc, setLocale];
}

/** Reactive translator bound to the current locale. */
export function useT(): (ja: string, vars?: Record<string, string | number>) => string {
  const loc = useSyncExternalStore(subscribe, getLocale, () => "ja");
  return useCallback(
    (ja: string, vars?: Record<string, string | number>) => translate(loc, ja, vars),
    [loc],
  );
}
