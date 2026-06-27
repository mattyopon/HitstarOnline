import { useT } from "@/lib/i18n";

export function Brand() {
  const t = useT();
  return (
    <div className="brand">
      <div className="logo" />
      <div>
        <h1>Hitstar Online</h1>
        <small>{t("みんなで曲の年代当て")}</small>
      </div>
    </div>
  );
}
