import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetKpi,
  useGetDispatcherRanking,
  useGetMe,
  type User,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardPeriodToolbar } from "@/components/dashboard-period-toolbar";
import { DriverStatusChips } from "@/components/driver-status-chips";
import { DriverTodayPanel } from "@/components/driver-today-panel";
import {
  fetchDriversToday,
  driversForChipFilter,
  type DriverChipFilter,
} from "@/lib/drivers-today";
import { DollarSign, Route, TrendingUp, Divide } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { translateLoadStatus } from "@/lib/i18n/translate";
import { toast } from "sonner";
import {
  buildDashboardFilterParams,
  formatWeekRangeLabel,
  getThisWeekStart,
  normalizeWeekStart,
} from "@/lib/date-range";
import {
  exportDashboardExcel,
  fetchAllFilteredLoads,
  getDashboardLoadsExportLabels,
} from "@/lib/export-dashboard-excel";

const AUTO_REFRESH_SEC = 20;

async function listDispatchers(): Promise<User[]> {
  const res = await fetch("/api/users/dispatchers", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load dispatchers");
  return res.json();
}

export default function Dashboard() {
  const { t, locale, formatCurrency, formatDate, formatNumber } = useI18n();
  const qc = useQueryClient();
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>(() => [getThisWeekStart()]);
  const [dispatcherFilter, setDispatcherFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState(AUTO_REFRESH_SEC);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [driverChipFilter, setDriverChipFilter] = useState<DriverChipFilter | null>(null);

  const { data: me } = useGetMe({});
  const isDispatcher = me?.role === "dispatcher";
  const canFilter = !isDispatcher;

  const filterParams = useMemo(
    () =>
      buildDashboardFilterParams({
        dateRange: "thisWeek",
        weekFilters: selectedWeeks,
        dispatcherFilter: isDispatcher ? "all" : dispatcherFilter,
      }),
    [selectedWeeks, dispatcherFilter, isDispatcher],
  );

  const { data: kpi, isLoading: kpiLoading } = useGetKpi(filterParams);
  const { data: ranking, isLoading: rankingLoading } = useGetDispatcherRanking(filterParams);
  const { data: weeks = [] } = useQuery<{ weekStart: string; loadCount?: number }[]>({
    queryKey: ["/api/board-weeks"],
    queryFn: async () => {
      const res = await fetch("/api/board-weeks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load weeks");
      return res.json();
    },
  });
  const { data: dispatchers } = useQuery({
    queryKey: ["/api/users/dispatchers"],
    queryFn: listDispatchers,
    enabled: canFilter,
  });

  const todayDispatcherId =
    isDispatcher ? undefined : dispatcherFilter !== "all" ? dispatcherFilter : undefined;

  const { data: driversToday, isLoading: driversTodayLoading } = useQuery({
    queryKey: ["/api/analytics/drivers-today", todayDispatcherId ?? "all"],
    queryFn: () => fetchDriversToday(todayDispatcherId),
    refetchInterval: autoRefresh ? AUTO_REFRESH_SEC * 1000 : false,
  });

  const handleDriverChipSelect = (filter: DriverChipFilter) => {
    setDriverChipFilter((prev) => (prev === filter ? null : filter));
  };

  useEffect(() => {
    setDriverChipFilter(null);
  }, [todayDispatcherId]);

  const driverPanelTitle = useMemo(() => {
    if (driverChipFilter === "covered") return t("dashboard.driversTodayCovered");
    if (driverChipFilter === "ready") return t("dashboard.driversTodayReady");
    if (driverChipFilter === "all") return t("dashboard.driversTodayAll");
    return "";
  }, [driverChipFilter, t]);

  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return typeof key === "string" && (
            key.startsWith("/api/analytics")
            || key.startsWith("/api/loads")
            || key === "/api/board-weeks"
          );
        },
      });
      setRefreshCountdown(AUTO_REFRESH_SEC);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      setRefreshCountdown((c) => {
        if (c <= 1) {
          void refreshDashboard();
          return AUTO_REFRESH_SEC;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, refreshDashboard]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const liveDateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "uz" ? "uz-UZ" : "en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now),
    [now, locale],
  );

  const periodLabel = useMemo(() => {
    const weeks = [...new Set(selectedWeeks.map(normalizeWeekStart).filter(Boolean))].sort();
    if (weeks.length === 1) return formatWeekRangeLabel(weeks[0]!, formatDate);
    if (weeks.length > 1) return t("dashboard.weeksSelected", { count: weeks.length });
    return formatWeekRangeLabel(getThisWeekStart(), formatDate);
  }, [selectedWeeks, formatDate, t]);

  const selectedDispatcherName = useMemo(() => {
    if (dispatcherFilter === "all") return null;
    const d = dispatchers?.find((u) => u.id === dispatcherFilter);
    return d?.name || d?.email || null;
  }, [dispatcherFilter, dispatchers]);

  const handleWeeksChange = (value: string[]) => {
    const normalized = [...new Set(value.map(normalizeWeekStart).filter(Boolean))];
    if (normalized.length === 0) return;
    setSelectedWeeks(normalized.sort((a, b) => b.localeCompare(a)));
  };

  useEffect(() => {
    if (!weeks?.length) return;
    const merged = new Map<string, number>();
    for (const w of weeks) {
      const mon = normalizeWeekStart(w.weekStart);
      merged.set(mon, (merged.get(mon) ?? 0) + (w.loadCount ?? 0));
    }
    const starts = [...merged.keys()].sort((a, b) => b.localeCompare(a));
    const current = selectedWeeks.map(normalizeWeekStart);
    const valid = current.filter((w) => starts.includes(w));
    if (valid.length === 0) {
      const fallback = starts.includes(getThisWeekStart()) ? getThisWeekStart() : starts[0]!;
      setSelectedWeeks([fallback]);
    } else if (valid.length !== current.length) {
      setSelectedWeeks(valid.sort((a, b) => b.localeCompare(a)));
    }
  }, [weeks, selectedWeeks]);

  const handleExport = async () => {
    if (!kpi) {
      toast.error(t("dashboard.noDataExport"));
      return;
    }
    setExporting(true);
    try {
      const loads = await fetchAllFilteredLoads(filterParams);
      const loadsLabels = getDashboardLoadsExportLabels(t);
      await exportDashboardExcel(
        {
          periodLabel,
          dispatcherLabel: selectedDispatcherName ?? t("dashboard.allDispatchers"),
          kpi,
          ranking: ranking ?? [],
          statusBreakdown: [],
          loads,
          formatCurrency,
          formatDate,
          translateStatus: (s) => translateLoadStatus(t, s),
        },
        {
          filePrefix: "dashboard",
          sheets: {
            summary: t("dashboard.exportSheetSummary"),
            performance: t("dashboard.leaderboard"),
            status: t("dashboard.loadStatus"),
            loads: t("dashboard.exportSheetLoads"),
          },
          summary: {
            title: t("dashboard.title"),
            period: t("dashboard.exportPeriod"),
            dispatcher: t("dashboard.filterDispatcher"),
            allDispatchers: t("dashboard.allDispatchers"),
            metric: t("dashboard.exportMetric"),
            value: t("dashboard.exportValue"),
            totalGross: t("dashboard.totalGross"),
            totalMiles: t("dashboard.totalMiles"),
            avgRpm: t("dashboard.avgRpm"),
            grossPerDriver: t("dashboard.grossPerDriver"),
            driversTotal: t("dashboard.driversTotal"),
            driversOnLoad: t("dashboard.driversOnLoad"),
            driversEmpty: t("dashboard.driversEmpty"),
          },
          performance: {
            rank: t("dashboard.rank"),
            dispatcher: t("dashboard.dispatcher"),
            loads: t("dashboard.loads"),
            gross: t("dashboard.gross"),
            avgRpm: t("dashboard.avgRpm"),
            score: t("dashboard.score"),
          },
          status: {
            status: t("dashboard.status"),
            count: t("dashboard.exportCount"),
          },
          loads: {
            period: t("dashboard.exportPeriod"),
            dispatcher: t("dashboard.filterDispatcher"),
            ...loadsLabels,
          },
        },
      );
      toast.success(t("dashboard.exportDone"));
    } catch {
      toast.error(t("dashboard.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="dashboard-title">
            {t("dashboard.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isDispatcher ? t("dashboard.subtitleDispatcher") : t("dashboard.subtitleCompany")}
          </p>
        </div>

        <DashboardPeriodToolbar
          t={t}
          formatDate={formatDate}
          selectedWeeks={selectedWeeks}
          activeWeeks={weeks ?? []}
          onWeeksChange={handleWeeksChange}
          onRefresh={() => void refreshDashboard()}
          onExport={() => void handleExport()}
          refreshing={refreshing}
          exporting={exporting}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          refreshCountdown={refreshCountdown}
          refreshIntervalSec={AUTO_REFRESH_SEC}
        />

        {canFilter && (
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={dispatcherFilter} onValueChange={setDispatcherFilter}>
              <SelectTrigger className="w-full sm:w-56 border-border bg-card h-9">
                <SelectValue placeholder={t("dashboard.filterDispatcher")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.allDispatchers")}</SelectItem>
                {(dispatchers ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name || d.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t("dashboard.totalGross")}</p>
                {kpiLoading ? <Skeleton className="h-8 w-24" /> : (
                  <h3 className="text-2xl font-bold text-foreground" data-testid="kpi-gross">{formatCurrency(kpi?.totalGross)}</h3>
                )}
              </div>
              <div className="p-2 bg-primary/10 rounded-lg"><DollarSign className="h-5 w-5 text-accent" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t("dashboard.totalMiles")}</p>
                {kpiLoading ? <Skeleton className="h-8 w-24" /> : (
                  <h3 className="text-2xl font-bold text-foreground" data-testid="kpi-miles">{formatNumber(kpi?.totalMiles ?? 0)}</h3>
                )}
              </div>
              <div className="p-2 bg-indigo-50 rounded-lg"><Route className="h-5 w-5 text-indigo-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t("dashboard.avgRpm")}</p>
                {kpiLoading ? <Skeleton className="h-8 w-24" /> : (
                  <h3 className="text-2xl font-bold text-foreground" data-testid="kpi-rpm">{formatCurrency(kpi?.avgRpm)}</h3>
                )}
              </div>
              <div className="p-2 bg-green-50 rounded-lg"><TrendingUp className="h-5 w-5 text-[#2E7D32]" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t("dashboard.grossPerDriver")}</p>
                {kpiLoading ? <Skeleton className="h-8 w-24" /> : (
                  <h3 className="text-2xl font-bold text-foreground" data-testid="kpi-gross-per-driver">
                    {formatCurrency(kpi?.grossPerDriver ?? 0)}
                  </h3>
                )}
              </div>
              <div className="p-2 bg-amber-50 rounded-lg"><Divide className="h-5 w-5 text-amber-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <p className="text-sm font-medium text-muted-foreground">
              {isDispatcher ? t("dashboard.driverStatsDispatcher") : t("dashboard.driverStatsCompany")}
            </p>
            <p
              className="text-sm font-semibold text-foreground tabular-nums"
              data-testid="dashboard-live-clock"
            >
              {t("dashboard.liveNow")}: {liveDateTime}
            </p>
          </div>
          {driversTodayLoading ? (
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-10 w-36 rounded-lg" />
              <Skeleton className="h-10 w-40 rounded-lg" />
              <Skeleton className="h-10 w-36 rounded-lg" />
            </div>
          ) : (
            <>
              <DriverStatusChips
                total={driversToday?.totalDrivers ?? 0}
                covered={driversToday?.driversOnLoad ?? 0}
                ready={driversToday?.driversEmpty ?? 0}
                selected={driverChipFilter}
                onSelect={handleDriverChipSelect}
                labels={{
                  all: t("dashboard.driversAll"),
                  covered: t("dashboard.driversOnLoad"),
                  ready: t("dashboard.driversEmpty"),
                }}
              />
              {driverChipFilter && driversToday && (
                <DriverTodayPanel
                  filter={driverChipFilter}
                  drivers={driversForChipFilter(driversToday, driverChipFilter)}
                  todayDate={driversToday.date}
                  title={driverPanelTitle}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-lg font-bold text-foreground">
              {t("dashboard.leaderboard")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t("dashboard.leaderboardPeriod", { period: periodLabel })}
              {selectedDispatcherName && (
                <span className="ml-1 font-medium text-foreground">
                  · {t("dashboard.filteredByDispatcher", { name: selectedDispatcherName })}
                </span>
              )}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {rankingLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : ranking && ranking.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                    <tr>
                      <th className="px-6 py-3">{t("dashboard.rank")}</th>
                      <th className="px-6 py-3">{t("dashboard.dispatcher")}</th>
                      <th className="px-6 py-3">{t("dashboard.loads")}</th>
                      <th className="px-6 py-3">{t("dashboard.gross")}</th>
                      <th className="px-6 py-3">{t("dashboard.avgRpm")}</th>
                      <th className="px-6 py-3">{t("dashboard.score")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr
                        key={r.dispatcherId}
                        className={`border-b hover:bg-muted/50 ${me?.id === r.dispatcherId ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-6 py-4 font-medium">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                        </td>
                        <td className="px-6 py-4 font-semibold text-foreground">{r.dispatcherName}</td>
                        <td className="px-6 py-4">{r.loads}</td>
                        <td className="px-6 py-4">{formatCurrency(r.gross)}</td>
                        <td className="px-6 py-4">{formatCurrency(r.avgRpm)}</td>
                        <td className="px-6 py-4 font-bold text-accent">{r.kpiScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">{t("dashboard.noRanking")}</div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
