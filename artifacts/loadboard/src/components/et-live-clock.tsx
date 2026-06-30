import { useEffect, useMemo, useState } from "react";
import { APP_TIMEZONE } from "@/lib/date-range";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type EtLiveClockProps = {
  variant?: "compact" | "full";
  className?: string;
  showLabel?: boolean;
  "data-testid"?: string;
};

export function EtLiveClock({
  variant = "compact",
  className,
  showLabel = false,
  "data-testid": testId,
}: EtLiveClockProps) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const intlLocale = "en-US";

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { datePart, timePart, full } = useMemo(() => {
    const datePart = new Intl.DateTimeFormat(intlLocale, {
      timeZone: APP_TIMEZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(now);
    const timePart = `${new Intl.DateTimeFormat(intlLocale, {
      timeZone: APP_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now)} ET`;
    const full = `${new Intl.DateTimeFormat(intlLocale, {
      timeZone: APP_TIMEZONE,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now)} ET`;
    return { datePart, timePart, full };
  }, [now, intlLocale]);

  if (variant === "full") {
    return (
      <p
        className={cn("text-sm font-semibold text-foreground tabular-nums", className)}
        data-testid={testId}
      >
        {showLabel ? `${t("dashboard.liveNow")}: ${full}` : full}
      </p>
    );
  }

  return (
    <div
      className={cn("flex flex-col items-end text-right leading-tight tabular-nums", className)}
      data-testid={testId ?? "header-live-clock"}
      title={`${datePart} · ${timePart}`}
    >
      <span className="text-sm font-semibold text-foreground">{timePart}</span>
      <span className="text-[11px] text-muted-foreground">{datePart}</span>
    </div>
  );
}
