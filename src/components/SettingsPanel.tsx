"use client";

import { useState } from "react";
import { getSeVolume, setSeVolume } from "@/lib/rankSound";
import { LOCALES, useLocale, useT } from "@/lib/i18n";

/** Site settings modal: language + sound-effect (SE) volume. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [locale, setLoc] = useLocale();
  const [se, setSe] = useState<number>(() => Math.round(getSeVolume() * 100));

  return (
    <div className="tap-overlay" onClick={onClose}>
      <div
        className="card stack"
        style={{ maxWidth: 420, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row spread">
          <h2 style={{ margin: 0 }}>⚙️ {t("設定")}</h2>
          <button className="btn ghost tiny" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="tiny muted">{t("言語 / Language")}</label>
        <select value={locale} onChange={(e) => setLoc(e.target.value)} aria-label="Language">
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <label className="tiny muted">{t("効果音（SE）の音量")}</label>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <span className="tiny muted">🔈</span>
          <input
            type="range"
            min={0}
            max={100}
            value={se}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSe(v);
              setSeVolume(v);
            }}
            style={{ flex: 1 }}
            aria-label="SE音量"
          />
          <span className="tiny muted" style={{ width: 32, textAlign: "right" }}>
            {se}
          </span>
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          入室時のランク演出などの効果音の音量です。曲（YouTube）の音量はゲーム画面で個別に調整できます。
        </p>
      </div>
    </div>
  );
}
