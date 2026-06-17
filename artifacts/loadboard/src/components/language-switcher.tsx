import { Globe } from "lucide-react";
import { useI18n, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher({
  compact = false,
  onDarkPanel = false,
}: {
  compact?: boolean;
  onDarkPanel?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();

  const toggle = () => setLocale(locale === "en" ? "uz" : "en");

  if (compact) {
    return (
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-colors"
        title={t("language.en") + " / " + t("language.uz")}
      >
        <Globe size={14} />
        {locale.toUpperCase()}
      </button>
    );
  }

  if (onDarkPanel) {
    return (
      <div
        className="flex items-center gap-0.5 rounded-full border border-white/15 bg-white/5 p-0.5"
        role="group"
        aria-label={t("language.en") + " / " + t("language.uz")}
      >
        {(["uz", "en"] as Locale[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
              locale === l
                ? "bg-white/20 text-white shadow-sm"
                : "text-blue-100/80 hover:text-white hover:bg-white/10"
            }`}
          >
            {l === "uz" ? "O'ZB" : "ENG"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5 shadow-sm">
      {(["uz", "en"] as Locale[]).map((l) => (
        <Button
          key={l}
          variant={locale === l ? "default" : "ghost"}
          size="sm"
          onClick={() => setLocale(l)}
          className={
            locale === l
              ? "h-7 bg-primary text-primary-foreground text-xs px-3"
              : "h-7 text-muted-foreground text-xs px-3"
          }
        >
          {l === "uz" ? "O'ZB" : "ENG"}
        </Button>
      ))}
    </div>
  );
}
