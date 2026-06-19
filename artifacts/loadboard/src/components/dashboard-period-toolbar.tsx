import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  RefreshCw,
} from "lucide-react";
import {
  type DashboardDateRange,
  formatWeekRangeLabel,
  getLastWeekStart,
  getThisWeekStart,
} from "@/lib/date-range";

const DATE_RANGES = ["thisWeek", "lastWeek", "thisMonth"] as const;

export type ActiveWeek = {
  weekStart: string;
  loadCount?: number;
};

type Props = {
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (d: string | Date) => string;
  dateRange: DashboardDateRange;
  weekFilter: string;
  activeWeeks: ActiveWeek[];
  onDateRange: (range: DashboardDateRange) => void;
  onWeekChange: (weekStart: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  refreshing: boolean;
  exporting: boolean;
  autoRefresh: boolean;
  onAutoRefreshChange: (on: boolean) => void;
  refreshCountdown: number;
  refreshIntervalSec: number;
};

export function DashboardPeriodToolbar({
  t,
  formatDate,
  dateRange,
  weekFilter,
  activeWeeks,
  onDateRange,
  onWeekChange,
  onRefresh,
  onExport,
  refreshing,
  exporting,
  autoRefresh,
  onAutoRefreshChange,
  refreshCountdown,
  refreshIntervalSec,
}: Props) {
  const [weekListOpen, setWeekListOpen] = useState(false);

  const weekOptions = useMemo(
    () => activeWeeks.map((w) => w.weekStart).sort((a, b) => b.localeCompare(a)),
    [activeWeeks],
  );

  const loadCountByWeek = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of activeWeeks) {
      map.set(w.weekStart, w.loadCount ?? 0);
    }
    return map;
  }, [activeWeeks]);

  const activeWeekStart = useMemo(() => {
    if (weekFilter !== "all") return weekFilter;
    if (dateRange === "thisWeek") return getThisWeekStart();
    if (dateRange === "lastWeek") return getLastWeekStart();
    if (weekOptions.length > 0) return weekOptions[0];
    return getThisWeekStart();
  }, [weekFilter, dateRange, weekOptions]);

  const navigateWeek = (delta: number) => {
    if (weekOptions.length === 0) return;
    const idx = weekOptions.indexOf(activeWeekStart);
    const baseIdx = idx >= 0 ? idx : 0;
    const nextIdx = Math.max(0, Math.min(weekOptions.length - 1, baseIdx + delta));
    onWeekChange(weekOptions[nextIdx]!);
  };

  const showWeekNav = dateRange !== "thisMonth" || weekFilter !== "all";
  const canGoNewer = weekOptions.length > 0 && weekOptions.indexOf(activeWeekStart) > 0;
  const canGoOlder =
    weekOptions.length > 0
    && weekOptions.indexOf(activeWeekStart) < weekOptions.length - 1
    && weekOptions.indexOf(activeWeekStart) >= 0;

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <Switch
              id="dash-auto-refresh"
              checked={autoRefresh}
              onCheckedChange={onAutoRefreshChange}
            />
            <Label htmlFor="dash-auto-refresh" className="text-xs font-medium cursor-pointer leading-tight">
              {t("dashboard.autoRefresh")}
              {autoRefresh && (
                <span className="block text-[10px] text-muted-foreground font-normal">
                  {t("dashboard.autoRefreshEvery", {
                    sec: refreshIntervalSec,
                    remaining: refreshCountdown,
                  })}
                </span>
              )}
            </Label>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-border"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {t("dashboard.refresh")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-border text-accent"
            onClick={onExport}
            disabled={exporting}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? t("dashboard.exporting") : t("dashboard.exportExcel")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex space-x-1 bg-card p-1 rounded-lg shadow-sm border border-border">
            {DATE_RANGES.map((range) => (
              <Button
                key={range}
                variant={dateRange === range && weekFilter === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => onDateRange(range)}
                className={
                  dateRange === range && weekFilter === "all"
                    ? "bg-primary text-white"
                    : "text-muted-foreground"
                }
              >
                {t(`dashboard.${range}`)}
              </Button>
            ))}
          </div>

          {showWeekNav && (
            <div className="flex items-center rounded-lg border border-border bg-card shadow-sm overflow-hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-none shrink-0"
                onClick={() => navigateWeek(1)}
                disabled={!canGoOlder}
                aria-label={t("dashboard.prevWeek")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover open={weekListOpen} onOpenChange={setWeekListOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex flex-col items-center px-3 py-1.5 min-w-[148px] hover:bg-muted/50 transition-colors border-x border-border"
                  >
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">
                      {t("dashboard.title")}
                    </span>
                    <span className="text-xs font-medium text-foreground flex items-center gap-0.5">
                      {formatWeekRangeLabel(activeWeekStart, formatDate)}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <div className="px-3 py-2 border-b border-border bg-muted/40">
                    <p className="text-xs font-bold text-foreground uppercase tracking-wide">
                      {t("dashboard.activeWeeks")}
                    </p>
                  </div>
                  <div className="max-h-56 overflow-y-auto py-1">
                    {weekOptions.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                        {t("common.noData")}
                      </p>
                    ) : (
                      weekOptions.map((ws) => {
                        const count = loadCountByWeek.get(ws) ?? 0;
                        return (
                          <button
                            key={ws}
                            type="button"
                            className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 border-b border-border/50 last:border-0 ${
                              ws === activeWeekStart ? "bg-primary/10 text-primary" : ""
                            }`}
                            onClick={() => {
                              onWeekChange(ws);
                              setWeekListOpen(false);
                            }}
                          >
                            <span className="font-bold text-xs uppercase tracking-wide text-accent">
                              {t("dashboard.title")}
                            </span>
                            <span className="block text-sm font-medium text-foreground mt-0.5">
                              {formatWeekRangeLabel(ws, formatDate)}
                            </span>
                            {count > 0 && (
                              <span className="block text-[11px] text-muted-foreground mt-0.5">
                                {t("dashboard.weekLoadsCount", { count })}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-none shrink-0"
                onClick={() => navigateWeek(-1)}
                disabled={!canGoNewer}
                aria-label={t("dashboard.nextWeek")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {dateRange === "thisMonth" && weekFilter === "all" && (
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm">
              {t("dashboard.thisMonth")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
