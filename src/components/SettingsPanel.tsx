"use client";

import { useState } from "react";
import { getSeVolume, setSeVolume } from "@/lib/rankSound";

/** Site settings modal. Currently: sound-effect (SE) volume. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [se, setSe] = useState<number>(() => Math.round(getSeVolume() * 100));

  return (
    <div className="tap-overlay" onClick={onClose}>
      <div
        className="card stack"
        style={{ maxWidth: 420, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row spread">
          <h2 style={{ margin: 0 }}>⚙️ 設定</h2>
          <button className="btn ghost tiny" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="tiny muted">効果音（SE）の音量</label>
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
