import { useI18n } from "@/lib/i18n";

export default function DriverDetail() {
  const { t } = useI18n();
  return (
    <div className="p-8 text-center">
      <h1 className="text-2xl font-bold text-foreground mb-2">{t("driverDetail.title")}</h1>
      <p className="text-muted-foreground">{t("driverDetail.comingSoon")}</p>
    </div>
  );
}
