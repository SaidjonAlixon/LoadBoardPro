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
import { DriverStatusboardFilters } from "@/components/driver-status-entity-filter";
import { DriverStatusboard } from "@/components/driver-statusboard";
import { LeaderboardRank } from "@/components/leaderboard-rank";
import { LoadsWeekToolbar } from "@/components/loads-week-toolbar";
import {
  fetchDriversToday,
  countDriversByStatus,
  emptyStatusCounts,
  buildDriverFilterOptions,
  buildDispatcherFilterOptions,
  type DriverChipFilter,
  type DriversTodayScope,
} from "@/lib/drivers-today";
import { DRIVER_BOARD_STATUS_I18N, resolveDriverBoardStatus } from "@/lib/driver-board-status";
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

const DRIVER_TYPE_EXPORT_KEYS: Record<string, string> = {
  OO: "drivers.ooShort",
  CD: "drivers.cdShort",
  Lease: "drivers.lease",
};

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
  const [driverChipFilter, setDriverChipFilter] = useState<DriverChipFilter>("all");
  const [statusboardDriverFilterId, setStatusboardDriverFilterId] = useState<string | null>(null);
  const [statusboardDispatcherFilterKey, setStatusboardDispatcherFilterKey] = useState<string | null>(null);
  const [driverScope, setDriverScope] = useState<DriversTodayScope>("company");
  const [statusboardWeek, setStatusboardWeek] = useState(() => getThisWeekStart());

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
    isDispatcher
      ? (driverScope === "mine" ? me?.id : undefined)
      : (dispatcherFilter !== "all" ? dispatcherFilter : undefined);

  const todayScope: DriversTodayScope | undefined = isDispatcher
    ? driverScope
    : (todayDispatcherId ? "mine" : "company");

  const { data: driversToday, isLoading: driversTodayLoading } = useQuery({
    queryKey: [
      "/api/analytics/drivers-today",
      todayScope ?? "company",
      todayDispatcherId ?? "all",
      statusboardWeek,
    ],
    queryFn: () => fetchDriversToday({
      scope: todayScope,
      dispatcherId: todayDispatcherId,
      weekStart: statusboardWeek,
    }),
    refetchInterval: autoRefresh ? AUTO_REFRESH_SEC * 1000 : false,
  });

  const handleDriverChipSelect = (filter: DriverChipFilter) => {
    setDriverChipFilter(filter);
  };

  useEffect(() => {
    setDriverChipFilter("all");
    setStatusboardDriverFilterId(null);
    setStatusboardDispatcherFilterKey(null);
  }, [todayDispatcherId, driverScope, statusboardWeek]);

  const statusboardWeekLabel = useMemo(
    () => formatWeekRangeLabel(statusboardWeek, formatDate),
    [statusboardWeek, formatDate],
  );

  const groupStatusboardByDispatcher =
    (isDispatcher && driverScope === "company") ||
    (!isDispatcher && !todayDispatcherId);

  const driverStatusCounts = useMemo(
    () => (driversToday ? countDriversByStatus(driversToday.allDrivers) : null),
    [driversToday],
  );

  const driverFilterOptions = useMemo(
    () => (driversToday ? buildDriverFilterOptions(driversToday.allDrivers) : []),
    [driversToday],
  );

  const dispatcherFilterOptions = useMemo(() => {
    if (!driversToday) return [];
    const options = buildDispatcherFilterOptions(
      driversToday.dispatcherGroups,
      driversToday.allDrivers,
    );
    return options.map((o) => ({
      ...o,
      name: o.name === "Unassigned" ? t("statusboard.unassigned") : o.name,
    }));
  }, [driversToday, t]);

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
            || key === "/api/drivers"
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
      const [loads, driversExport] = await Promise.all([
        fetchAllFilteredLoads(filterParams),
        fetchDriversToday({
          scope: todayScope,
          dispatcherId: todayDispatcherId,
          weekStart: statusboardWeek,
        }),
      ]);
      const driversScopeLabel = isDispatcher
        ? (driverScope === "mine" ? t("dashboard.driversScopeMine") : t("dashboard.driversScopeAll"))
        : (todayDispatcherId
          ? (dispatchers?.find((d) => d.id === todayDispatcherId)?.name
            ?? dispatchers?.find((d) => d.id === todayDispatcherId)?.email
            ?? t("dashboard.allDispatchers"))
          : t("dashboard.driversScopeAll"));
      const loadsLabels = getDashboardLoadsExportLabels(t);
      await exportDashboardExcel(
        {
          periodLabel,
          dispatcherLabel: selectedDispatcherName ?? t("dashboard.allDispatchers"),
          kpi,
          ranking: ranking ?? [],
          statusBreakdown: [],
          loads,
          driversToday: driversExport,
          driversScopeLabel,
          weekLabel: statusboardWeekLabel,
          groupStatusboardByDispatcher,
          formatCurrency,
          formatDate,
          formatNumber,
          translateStatus: (s) => translateLoadStatus(t, s),
          translateBoardStatus: (s) => t(DRIVER_BOARD_STATUS_I18N[s]),
          translateDriverType: (type) => t(DRIVER_TYPE_EXPORT_KEYS[type] ?? type),
        },
        {
          filePrefix: "dashboard",
          sheets: {
            summary: t("dashboard.exportSheetSummary"),
            performance: t("dashboard.leaderboard"),
            status: t("dashboard.loadStatus"),
            loads: t("dashboard.exportSheetLoads"),
            drivers: t("dashboard.exportSheetDrivers"),
            statusboard: t("dashboard.exportSheetStatusboard"),
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
          drivers: {
            title: t("dashboard.exportDriversTitle"),
            date: t("dashboard.exportDriversDate"),
            scope: t("dashboard.exportDriversScope"),
            sectionOverview: t("dashboard.exportDriversOverview"),
            sectionLoads: t("dashboard.exportDriversLoadsSection"),
            overviewHeaders: [
              t("loads.sheet.rowNumber"),
              t("dashboard.driver"),
              t("loads.sheet.type"),
              t("drivers.truckNumber"),
              t("drivers.phone"),
              t("drivers.email"),
              t("dashboard.status"),
              t("dashboard.currentLocation"),
              t("dashboard.loads"),
              t("dashboard.gross"),
              t("loads.sheet.mileage"),
              t("loads.sheet.reimbursement"),
              t("dashboard.exportActiveStatus"),
            ],
            loadHeaders: [
              t("dashboard.driver"),
              t("loads.sheet.loadNumber"),
              t("loads.sheet.status"),
              t("loads.sheet.puDate"),
              t("loads.sheet.origin"),
              t("loads.sheet.delDate"),
              t("loads.sheet.destination"),
              t("loads.sheet.mileage"),
              t("loads.sheet.rpm"),
              t("loads.sheet.rate"),
              t("loads.sheet.reimbursement"),
              t("loads.sheet.dispatcher"),
              t("loads.broker"),
              t("loads.sheet.dispatchNotes"),
            ],
            statusCovered: t("dashboard.driversOnLoad"),
            statusReady: t("dashboard.driversEmpty"),
            active: t("status.active"),
            inactive: t("status.inactive"),
            noLoadToday: t("dashboard.driverNoLoadToday"),
          },
          statusboard: {
            title: t("statusboard.title"),
            weekPeriod: t("dashboard.exportPeriod"),
            scope: t("dashboard.exportDriversScope"),
            statusSummary: t("dashboard.exportStatusboardSummary"),
            unassigned: t("statusboard.unassigned"),
            allDrivers: t("dashboard.driversAll"),
            headers: [
              t("statusboard.truckNumber"),
              t("statusboard.driverName"),
              t("statusboard.phone"),
              t("statusboard.type"),
              t("statusboard.odometer"),
              t("statusboard.loadId"),
              t("statusboard.origin"),
              t("statusboard.destination"),
              t("statusboard.scheduledTime"),
              t("statusboard.eta"),
              t("statusboard.status"),
              t("statusboard.prebook"),
              t("statusboard.note"),
            ],
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
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(2.75rem+5*3.25rem)]">
                <table className="w-full text-sm text-left">
                  <thead className="sticky top-0 z-10 text-xs text-muted-foreground bg-muted/95 uppercase border-b backdrop-blur-sm">
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
                    {ranking.map((r, i) => {
                      const isMe = me?.id === r.dispatcherId;
                      return (
                      <tr
                        key={r.dispatcherId}
                        className={`border-b hover:bg-muted/50 ${isMe ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-6 py-4">
                          <LeaderboardRank rank={i + 1} />
                        </td>
                        <td className="px-6 py-4 font-semibold text-foreground">
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <span className="truncate">{r.dispatcherName}</span>
                            {isMe && (
                              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground">
                                {t("dashboard.leaderboardMe")}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4">{r.loads}</td>
                        <td className="px-6 py-4">{formatCurrency(r.gross)}</td>
                        <td className="px-6 py-4">{formatCurrency(r.avgRpm)}</td>
                        <td className="px-6 py-4 font-bold text-accent">{r.kpiScore.toFixed(1)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">{t("dashboard.noRanking")}</div>
            )}
          </CardContent>
        </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">{t("dashboard.driverStats")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isDispatcher ? t("dashboard.subtitleDispatcher") : t("dashboard.driverStatsCompany")}
              </p>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              <LoadsWeekToolbar
                weekStart={statusboardWeek}
                weeks={weeks}
                onWeekChange={setStatusboardWeek}
                onCreateWeek={() => {}}
                formatDate={formatDate}
                t={t}
                canManageWeeks={false}
              />
              <p
                className="text-sm font-semibold text-foreground tabular-nums"
                data-testid="dashboard-live-clock"
              >
                {t("dashboard.liveNow")}: {liveDateTime}
              </p>
            </div>
          </div>
          {driversTodayLoading ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-10 w-36 rounded-lg" />
                <Skeleton className="h-10 w-40 rounded-lg" />
                <Skeleton className="h-10 w-36 rounded-lg" />
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : (
            <>
              {(isDispatcher || canFilter) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {isDispatcher && (
                    <>
                      {([
                        { key: "company" as const, label: t("dashboard.driversScopeAll") },
                        { key: "mine" as const, label: t("dashboard.driversScopeMine") },
                      ]).map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setDriverScope(key)}
                          className={`inline-flex items-center rounded-lg border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                            driverScope === key
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-muted/40 border-border text-muted-foreground hover:bg-muted/60"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
              <DriverStatusChips
                total={driversToday?.totalDrivers ?? 0}
                statusCounts={driverStatusCounts ?? emptyStatusCounts()}
                selected={driverChipFilter}
                onSelect={handleDriverChipSelect}
                allLabel={t("dashboard.driversAll")}
                statusLabel={(key) => t(key)}
                trailing={
                  driversToday ? (
                    <DriverStatusboardFilters
                      driverFilterId={statusboardDriverFilterId}
                      dispatcherFilterKey={statusboardDispatcherFilterKey}
                      onDriverFilterChange={setStatusboardDriverFilterId}
                      onDispatcherFilterChange={setStatusboardDispatcherFilterKey}
                      drivers={driverFilterOptions}
                      dispatchers={dispatcherFilterOptions}
                      allDriversLabel={t("dashboard.statusboardFilterAll")}
                      allDispatchersLabel={t("dashboard.statusboardFilterAllDispatchers")}
                      driverPlaceholder={t("dashboard.statusboardFilterDriverPlaceholder")}
                      dispatcherPlaceholder={t("dashboard.statusboardFilterDispatcherPlaceholder")}
                      clearLabel={t("common.clear")}
                    />
                  ) : null
                }
              />
              {driversToday && (
                <DriverStatusboard
                  filter={driverChipFilter}
                  driverFilterId={statusboardDriverFilterId}
                  dispatcherFilterKey={statusboardDispatcherFilterKey}
                  drivers={driversToday.allDrivers}
                  groups={driversToday.dispatcherGroups}
                  weekLabel={statusboardWeekLabel}
                  weekStart={driversToday.weekStart}
                  groupByDispatcher={groupStatusboardByDispatcher}
                  editorUserId={me?.id}
                  editorRole={me?.role}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
