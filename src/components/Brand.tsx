import { useT } from "@/lib/i18n";

export function Brand() {
  const t = useT();
  return (
    <div className="brand">
      <span className="brand-note" aria-hidden="true">
        ♪
      </span>
      <div>
        <h1 className="title-logo-text brand-title">Hitstar Online</h1>
        <small>{t("みんなで曲の年代当て")}</small>
      </div>
    </div>
  );
}
