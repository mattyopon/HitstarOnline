"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

/**
 * Shop screen (bottom-nav "ショップ"/Shop tab).
 *
 * There is NO purchase/payments backend and this task must not add one — so
 * this screen is PURELY PRESENTATIONAL: a BILIBILI-styled grid of display-only
 * gem / note packs. Every "購入" button just surfaces a transient t()
 * "準備中/coming soon" notice; nothing is fetched, spent, or granted. The pack
 * amounts/prices below are hard-coded display copy, not a real catalogue.
 */

type Pack = {
  id: string;
  kind: "gem" | "note";
  amount: number;
  bonus?: number; // extra units advertised on the card (display only)
  priceLabel: string; // pre-formatted display price (no currency logic)
  tag?: "人気" | "お得♡"; // optional ribbon key, resolved via t()
};

// Display-only catalogue. Prices are illustrative placeholders (no payments).
const GEM_PACKS: Pack[] = [
  { id: "gem-s", kind: "gem", amount: 300, priceLabel: "¥120" },
  { id: "gem-m", kind: "gem", amount: 980, bonus: 80, priceLabel: "¥360", tag: "人気" },
  { id: "gem-l", kind: "gem", amount: 1980, bonus: 300, priceLabel: "¥720", tag: "お得♡" },
  { id: "gem-xl", kind: "gem", amount: 6480, bonus: 1500, priceLabel: "¥2,400" },
];

const NOTE_PACKS: Pack[] = [
  { id: "note-s", kind: "note", amount: 500, priceLabel: "¥120" },
  { id: "note-m", kind: "note", amount: 1800, bonus: 200, priceLabel: "¥360", tag: "人気" },
];

export function ShopScreen({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // No purchase backend exists — "buying" just shows a transient coming-soon
  // notice. Purely a UI affordance.
  function fakeBuy() {
    setNotice(t("課金機能は準備中です。もうしばらくお待ちください！"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 2600);
  }

  const renderPack = (p: Pack) => {
    const icon = p.kind === "gem" ? "💎" : "🎵";
    const unit = p.kind === "gem" ? t("GEMS") : t("NOTES");
    return (
      <div key={p.id} className={"shop-pack ctile " + p.kind}>
        {p.tag && <span className="shop-pack-tag">{p.tag === "人気" ? t("人気") : t("お得♡")}</span>}
        <div className="shop-pack-icon" aria-hidden>
          {icon}
        </div>
        <div className="shop-pack-amount">
          {p.amount.toLocaleString()}
          <small>{unit}</small>
        </div>
        {p.bonus ? (
          <div className="shop-pack-bonus">
            + {p.bonus.toLocaleString()} {t("ボーナス")}
          </div>
        ) : (
          <div className="shop-pack-bonus placeholder" aria-hidden />
        )}
        <button
          type="button"
          className="btn sm shop-buy-btn"
          onClick={fakeBuy}
          aria-label={`${p.priceLabel} — ${t("購入")}（${t("準備中")}）`}
        >
          {p.priceLabel}
        </button>
      </div>
    );
  };

  return (
    <div className="screen-roster-inner">
      <div className="roster-hero">
        <div>
          <h1 className="ttl">
            {t("ショップ")}
            <small>{t("ジェム・ノートパック")}</small>
          </h1>
        </div>
        {onClose && (
          <button type="button" className="btn outline sm" style={{ marginLeft: "auto" }} onClick={onClose}>
            {t("閉じる")}
          </button>
        )}
      </div>

      <div className="notice" role="note" style={{ marginBottom: 16 }}>
        {t("💡 ショップは表示サンプルです。実際の購入はまだできません（準備中）。")}
      </div>

      <div className="panel">
        <h3>
          💎 {t("ジェムパック")}
          <small>{t("ガチャ用")}</small>
        </h3>
        <div className="shop-grid">{GEM_PACKS.map(renderPack)}</div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>
          🎵 {t("ノートパック")}
          <small>{t("デイリー補充")}</small>
        </h3>
        <div className="shop-grid">{NOTE_PACKS.map(renderPack)}</div>
      </div>

      {notice && (
        <div className="shop-toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}
    </div>
  );
}
