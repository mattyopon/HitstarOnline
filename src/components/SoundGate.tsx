"use client";

import { useT } from "@/lib/i18n";

/** Full-screen tap gate that unlocks browser audio (needed before autoplay). */
export function SoundGate({ onEnable }: { onEnable: () => void }) {
  const t = useT();
  return (
    <div className="tap-overlay" onClick={onEnable}>
      <div className="card stack" style={{ maxWidth: 360 }}>
        <div className="emoji-xl">🔊</div>
        <h2 style={{ margin: 0 }}>{t("タップして開始")}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t("音楽を再生するために一度タップしてください。")}
        </p>
        <button className="btn block">{t("サウンドを有効にする")}</button>
      </div>
    </div>
  );
}
