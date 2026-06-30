import { WeeklyTradingChart } from "@/components/weekly-trading-chart";
import { getThisWeekStart } from "@/lib/date-range";
import { useI18n } from "@/lib/i18n";

type DispatcherActivityChartProps = {
  values: number[];
  weekStart?: string;
  className?: string;
};

export function DispatcherActivityChart({
  values,
  weekStart,
  className,
}: DispatcherActivityChartProps) {
  const { t } = useI18n();

  return (
    <div className={className} title={t("dashboard.dailyActivityHint")}>
      <WeeklyTradingChart
        values={values}
        weekStart={weekStart ?? getThisWeekStart()}
        compact
        ariaLabel={t("dashboard.dailyActivity")}
      />
    </div>
  );
}
