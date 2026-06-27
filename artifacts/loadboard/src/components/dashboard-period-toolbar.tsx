import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  formatWeekRangeLabel,
  getThisWeekStart,
  normalizeWeekStart,
} from "@/lib/date-range";

export type ActiveWeek = {
  weekStart: string;
  loadCount?: number;
};

type Props = {
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (d: string | Date) => string;
  selectedWeeks: string[];
  activeWeeks: ActiveWeek[];
  onWeeksChange: (weekStarts: string[]) => void;
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
  selectedWeeks,
  activeWeeks,
  onWeeksChange,
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
  const calendarWeekStart = getThisWeekStart();

  const weekOptions = useMemo(() => {
    const merged = new Map<string, number>();
    for (const w of activeWeeks) {
      const mon = normalizeWeekStart(w.weekStart);
      merged.set(mon, (merged.get(mon) ?? 0) + (w.loadCount ?? 0));
    }
    return [...merged.keys()].sort((a, b) => b.localeCompare(a));
  }, [activeWeeks]);

  const loadCountByWeek = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of activeWeeks) {
      const mon = normalizeWeekStart(w.weekStart);
      map.set(mon, (map.get(mon) ?? 0) + (w.loadCount ?? 0));
    }
    return map;
  }, [activeWeeks]);

  const normalizedSelected = useMemo(
    () => [...new Set(selectedWeeks.map(normalizeWeekStart).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [selectedWeeks],
  );

  const primaryWeek = normalizedSelected[0] ?? calendarWeekStart;

  const headerLabel = useMemo(() => {
    if (normalizedSelected.length === 1) {
      return formatWeekRangeLabel(normalizedSelected[0]!, formatDate);
    }
    if (normalizedSelected.length > 1) {
      return t("dashboard.weeksSelected", { count: normalizedSelected.length });
    }
    return formatWeekRangeLabel(calendarWeekStart, formatDate);
  }, [normalizedSelected, formatDate, t, calendarWeekStart]);

  const navigateWeek = (delta: number) => {
    if (weekOptions.length === 0 || normalizedSelected.length !== 1) return;
    const idx = weekOptions.indexOf(primaryWeek);
    const baseIdx = idx >= 0 ? idx : 0;
    const nextIdx = Math.max(0, Math.min(weekOptions.length - 1, baseIdx + delta));
    onWeeksChange([weekOptions[nextIdx]!]);
  };

  const toggleWeek = (ws: string) => {
    const mon = normalizeWeekStart(ws);
    const has = normalizedSelected.includes(mon);
    if (has) {
      if (normalizedSelected.length <= 1) return;
      onWeeksChange(normalizedSelected.filter((w) => w !== mon));
    } else {
      onWeeksChange([...normalizedSelected, mon].sort((a, b) => b.localeCompare(a)));
    }
  };

  const canGoNewer = normalizedSelected.length === 1 && weekOptions.indexOf(primaryWeek) > 0;
  const canGoOlder =
    normalizedSelected.length === 1
    && weekOptions.indexOf(primaryWeek) >= 0
    && weekOptions.indexOf(primaryWeek) < weekOptions.length - 1;

  const showActiveBadge = normalizedSelected.includes(calendarWeekStart);

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <Switch
              id="dash-auto-refresh"
              checked={autoRefresh}
              onCheckedChange={onAutoRefreshChange}
              className="scale-125"
            />
            <Label htmlFor="dash-auto-refresh" className="text-sm sm:text-base font-semibold cursor-pointer leading-tight">
              {t("dashboard.autoRefresh")}
              {autoRefresh && (
                <span className="block text-xs sm:text-sm text-muted-foreground font-normal mt-0.5">
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
            className="h-11 px-4 gap-2 text-sm sm:text-base border-border"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
            {t("dashboard.refresh")}
          </Button>
          <Button
            type="button"
            className="btn-export-excel no-default-hover-elevate h-11 px-4 gap-2 text-sm sm:text-base"
            onClick={onExport}
            disabled={exporting}
          >
            <Download className="h-5 w-5" />
            {exporting ? t("dashboard.exporting") : t("dashboard.exportExcel")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-none shrink-0"
              onClick={() => navigateWeek(1)}
              disabled={weekOptions.length === 0 || !canGoOlder}
              aria-label={t("dashboard.prevWeek")}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Popover open={weekListOpen} onOpenChange={setWeekListOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex flex-col items-center px-4 py-2.5 min-w-[200px] sm:min-w-[240px] hover:bg-muted/50 transition-colors border-x border-border"
                >
                  <span className="text-xs sm:text-sm font-bold text-accent uppercase tracking-widest">
                    {t("dashboard.title")}
                  </span>
                  <span className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2 mt-0.5">
                    {headerLabel}
                    {showActiveBadge && (
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-green-800 bg-green-100 px-2 py-0.5 rounded">
                        {t("dashboard.weekActive")}
                      </span>
                    )}
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="px-3 py-2 border-b border-border bg-muted/40">
                  <p className="text-xs font-bold text-foreground uppercase tracking-wide">
                    {t("dashboard.weekList")}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t("dashboard.selectWeeksHint")}
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {weekOptions.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                      {t("common.noData")}
                    </p>
                  ) : (
                    weekOptions.map((ws) => {
                      const count = loadCountByWeek.get(ws) ?? 0;
                      const isSelected = normalizedSelected.includes(ws);
                      const isCurrentCalendarWeek = ws === calendarWeekStart;
                      return (
                        <button
                          key={ws}
                          type="button"
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 border-b border-border/50 last:border-0 ${
                            isSelected ? "bg-primary/5" : ""
                          }`}
                          onClick={() => toggleWeek(ws)}
                        >
                          <div className="flex items-start gap-2.5">
                            <Checkbox
                              checked={isSelected}
                              className="mt-0.5 pointer-events-none"
                              aria-hidden
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs uppercase tracking-wide text-accent">
                                  {t("dashboard.title")}
                                </span>
                                {isCurrentCalendarWeek && (
                                  <span className="text-[10px] font-bold uppercase tracking-wide text-green-800 bg-green-100 px-1.5 py-0.5 rounded shrink-0">
                                    {t("dashboard.weekActive")}
                                  </span>
                                )}
                              </div>
                              <span className="block text-sm font-medium text-foreground mt-0.5">
                                {formatWeekRangeLabel(ws, formatDate)}
                              </span>
                              <span className="block text-[11px] text-muted-foreground mt-0.5">
                                {t("dashboard.weekLoadsCount", { count })}
                              </span>
                            </div>
                          </div>
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
              className="h-11 w-11 rounded-none shrink-0"
              onClick={() => navigateWeek(-1)}
              disabled={weekOptions.length === 0 || !canGoNewer}
              aria-label={t("dashboard.nextWeek")}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
