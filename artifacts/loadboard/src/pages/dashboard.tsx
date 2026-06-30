import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { EtLiveClock } from "@/components/et-live-clock";
import { DispatcherActivityChart } from "@/components/dispatcher-activity-chart";
import {
  fetchDriversToday,
  countDriversByStatus,
  buildDriverFilterOptions,
  buildDispatcherFilterOptions,
  filterStatusboardSections,
  type DriverChipFilter,
  type DriversTodayScope,
} from "@/lib/drivers-today";
import { collectStatusboardVisibleDrivers } from "@/lib/status-board-new-load";
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
import { filterLoadsForViewer } from "@/lib/filter-loads-for-viewer";
import {
  computeSpreadsheetKpi,
  computeDispatcherRanking,
  computeDispatcherDailyActivity,
  computeTopDriversByGross,
  filterLoadsForSpreadsheetKpi,
} from "@/lib/compute-spreadsheet-kpi";

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
  const [driverChipFilter, setDriverChipFilter] = useState<DriverChipFilter>("all");
  const [statusboardDriverFilterId, setStatusboardDriverFilterId] = useState<string | null>(null);
  const [statusboardDispatcherFilterKey, setStatusboardDispatcherFilterKey] = useState<string | null>(null);
  const [driverScope, setDriverScope] = useState<DriversTodayScope>("company");

  const statusboardWeek = useMemo(
    () => normalizeWeekStart(selectedWeeks[0] ?? getThisWeekStart()),
    [selectedWeeks],
  );

  const statusboardWeekStarts = useMemo(
    () => {
      const weeks = [...new Set(selectedWeeks.map(normalizeWeekStart).filter(Boolean))].sort();
      return weeks.length > 1 ? weeks.join(",") : undefined;
    },
    [selectedWeeks],
  );

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

  const companyWeekLoadsParams = useMemo(
    () => ({
      ...(filterParams.weekStarts ? { weekStarts: filterParams.weekStarts } : {}),
      ...(filterParams.weekStart ? { weekStart: filterParams.weekStart } : {}),
    }),
    [filterParams],
  );

  const scopedKpiLoadsParams = useMemo(
    () => ({
      ...companyWeekLoadsParams,
      ...(isDispatcher && me?.id
        ? { dispatcherId: me.id }
        : filterParams.dispatcherId
          ? { dispatcherId: filterParams.dispatcherId }
          : {}),
    }),
    [companyWeekLoadsParams, filterParams.dispatcherId, isDispatcher, me?.id],
  );

  const kpiLoadsScoped =
    Boolean(scopedKpiLoadsParams.dispatcherId);

  const { data: companyLoads, isLoading: companyLoadsLoading } = useQuery({
    queryKey: ["/api/loads", "dashboard-company", companyWeekLoadsParams],
    queryFn: () => fetchAllFilteredLoads(companyWeekLoadsParams),
  });

  const { data: scopedKpiLoads, isLoading: scopedKpiLoadsLoading } = useQuery({
    queryKey: ["/api/loads", "dashboard-kpi", scopedKpiLoadsParams],
    queryFn: () => fetchAllFilteredLoads(scopedKpiLoadsParams),
    enabled: kpiLoadsScoped,
  });

  const kpiLoads = kpiLoadsScoped ? scopedKpiLoads : companyLoads;
  const kpiLoadsLoading = companyLoadsLoading || (kpiLoadsScoped && scopedKpiLoadsLoading);

  const { data: dispatchers } = useQuery({
    queryKey: ["/api/users/dispatchers"],
    queryFn: listDispatchers,
  });

  const kpiWeekStarts = useMemo(() => {
    if (filterParams.weekStarts) {
      return filterParams.weekStarts.split(",").map(normalizeWeekStart).filter(Boolean);
    }
    if (filterParams.weekStart) {
      return [normalizeWeekStart(filterParams.weekStart)];
    }
    return [...new Set(selectedWeeks.map(normalizeWeekStart).filter(Boolean))];
  }, [filterParams.weekStart, filterParams.weekStarts, selectedWeeks]);

  const leaderboardLoads = useMemo(() => {
    if (!companyLoads) return [];
    const visible = filterLoadsForViewer(companyLoads, me?.id);
    return filterLoadsForSpreadsheetKpi(visible, { weekStarts: kpiWeekStarts });
  }, [companyLoads, me?.id, kpiWeekStarts]);

  const kpiSourceLoads = useMemo(() => {
    if (!kpiLoads) return [];
    const visible = filterLoadsForViewer(kpiLoads, me?.id);
    return filterLoadsForSpreadsheetKpi(visible, { weekStarts: kpiWeekStarts });
  }, [kpiLoads, me?.id, kpiWeekStarts]);

  const kpi = useMemo(
    () => (kpiLoads ? computeSpreadsheetKpi(kpiSourceLoads) : undefined),
    [kpiLoads, kpiSourceLoads],
  );

  const ranking = useMemo(() => {
    if (!dispatchers?.length) return undefined;
    return computeDispatcherRanking(leaderboardLoads, dispatchers);
  }, [leaderboardLoads, dispatchers]);

  const leaderboardActivityWeek = normalizeWeekStart(
    selectedWeeks[0] ?? kpiWeekStarts[0] ?? getThisWeekStart(),
  );

  const chartWeekLoads = useMemo(() => {
    if (!companyLoads) return [];
    const visible = filterLoadsForViewer(companyLoads, me?.id);
    return filterLoadsForSpreadsheetKpi(visible, { weekStarts: [leaderboardActivityWeek] });
  }, [companyLoads, me?.id, leaderboardActivityWeek]);

  const { data: weeks = [] } = useQuery<{ weekStart: string; loadCount?: number }[]>({
    queryKey: ["/api/board-weeks"],
    queryFn: async () => {
      const res = await fetch("/api/board-weeks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load weeks");
      return res.json();
    },
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
      statusboardWeekStarts ?? "single",
    ],
    queryFn: () => fetchDriversToday({
      scope: todayScope,
      dispatcherId: todayDispatcherId,
      weekStart: statusboardWeek,
      weekStarts: statusboardWeekStarts,
    }),
    refetchInterval: autoRefresh ? AUTO_REFRESH_SEC * 1000 : false,
  });

  const topDrivers = useMemo(() => {
    const driverList =
      driversToday?.allDrivers.map((b) => ({
        id: b.driver.id,
        fullName: b.driver.fullName,
      })) ?? [];
    return computeTopDriversByGross(chartWeekLoads, driverList);
  }, [chartWeekLoads, driversToday]);

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
    todayScope === "company" && !todayDispatcherId;

  const statusboardSectionsForCounts = useMemo(() => {
    if (!driversToday) return [];
    return filterStatusboardSections(
      driversToday.allDrivers,
      driversToday.dispatcherGroups,
      groupStatusboardByDispatcher,
      "all",
      statusboardDriverFilterId,
      statusboardDispatcherFilterKey,
    );
  }, [
    driversToday,
    groupStatusboardByDispatcher,
    statusboardDriverFilterId,
    statusboardDispatcherFilterKey,
  ]);

  const visibleOnStatusboard = useMemo(
    () => collectStatusboardVisibleDrivers(statusboardSectionsForCounts, groupStatusboardByDispatcher),
    [statusboardSectionsForCounts, groupStatusboardByDispatcher],
  );

  const driverStatusCounts = useMemo(
    () => countDriversByStatus(visibleOnStatusboard),
    [visibleOnStatusboard],
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
          weekStarts: statusboardWeekStarts,
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight" data-testid="dashboard-title">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("dashboard.totalGross")}</p>
                {kpiLoadsLoading ? <Skeleton className="h-6 w-24" /> : (
                  <h3 className="text-xl font-bold text-foreground" data-testid="kpi-gross">{formatCurrency(kpi?.totalGross)}</h3>
                )}
              </div>
              <div className="p-1.5 bg-primary/10 rounded-md"><DollarSign className="h-4 w-4 text-accent" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("dashboard.totalMiles")}</p>
                {kpiLoadsLoading ? <Skeleton className="h-6 w-24" /> : (
                  <h3 className="text-xl font-bold text-foreground" data-testid="kpi-miles">{formatNumber(kpi?.totalMiles ?? 0)}</h3>
                )}
              </div>
              <div className="p-1.5 bg-indigo-50 rounded-md"><Route className="h-4 w-4 text-indigo-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("dashboard.avgRpm")}</p>
                {kpiLoadsLoading ? <Skeleton className="h-6 w-24" /> : (
                  <h3 className="text-xl font-bold text-foreground" data-testid="kpi-rpm">{formatCurrency(kpi?.avgRpm)}</h3>
                )}
              </div>
              <div className="p-1.5 bg-green-50 rounded-md"><TrendingUp className="h-4 w-4 text-[#2E7D32]" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("dashboard.grossPerDriver")}</p>
                {kpiLoadsLoading ? <Skeleton className="h-6 w-24" /> : (
                  <h3 className="text-xl font-bold text-foreground" data-testid="kpi-gross-per-driver">
                    {formatCurrency(kpi?.grossPerDriver ?? 0)}
                  </h3>
                )}
              </div>
              <div className="p-1.5 bg-amber-50 rounded-md"><Divide className="h-4 w-4 text-amber-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      <Card className="lg:col-span-8 w-full">
          <CardHeader className="px-3 py-2 border-b border-border">
            <CardTitle className="text-sm font-bold text-foreground">
              {t("dashboard.leaderboard")}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t("dashboard.leaderboardPeriod", { period: periodLabel })}
              {selectedDispatcherName && (
                <span className="ml-1 font-medium text-foreground">
                  · {t("dashboard.filteredByDispatcher", { name: selectedDispatcherName })}
                </span>
              )}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {kpiLoadsLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : ranking && ranking.length > 0 ? (
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(1.75rem+5*2.25rem)]">
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 z-10 text-[10px] text-muted-foreground bg-muted/95 uppercase border-b backdrop-blur-sm">
                    <tr>
                      <th className="px-2 py-1.5 w-10">{t("dashboard.rank")}</th>
                      <th className="px-2 py-1.5">{t("dashboard.dispatcher")}</th>
                      <th className="px-2 py-1.5 text-right">{t("dashboard.loads")}</th>
                      <th className="px-2 py-1.5 text-right">{t("dashboard.gross")}</th>
                      <th className="px-2 py-1.5 text-right">{t("dashboard.avgRpm")}</th>
                      <th className="px-2 py-1.5 w-[4.5rem]">{t("dashboard.dailyActivity")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => {
                      const isMe = me?.id === r.dispatcherId;
                      const activity = computeDispatcherDailyActivity(
                        chartWeekLoads,
                        r.dispatcherId,
                        [leaderboardActivityWeek],
                      );
                      return (
                      <tr
                        key={r.dispatcherId}
                        className={`border-b hover:bg-muted/50 ${isMe ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-2 py-1.5">
                          <LeaderboardRank rank={i + 1} />
                        </td>
                        <td className="px-2 py-1.5 font-semibold text-foreground">
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <span className="truncate max-w-[7rem]">{r.dispatcherName}</span>
                            {isMe && (
                              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded-md bg-primary text-primary-foreground">
                                {t("dashboard.leaderboardMe")}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.loads}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(r.gross)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(r.avgRpm)}</td>
                        <td className="px-2 py-1.5">
                          <DispatcherActivityChart
                            values={activity}
                            weekStart={leaderboardActivityWeek}
                          />
                          <span className="sr-only">{r.kpiScore.toFixed(1)}</span>
                        </td>
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

        <Card className="lg:col-span-4 w-full">
          <CardHeader className="px-3 py-2 border-b border-border">
            <CardTitle className="text-sm font-bold text-foreground">
              {t("dashboard.topDrivers")}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">{periodLabel}</p>
          </CardHeader>
          <CardContent className="px-3 py-2">
            {companyLoadsLoading ? (
              <Skeleton className="h-24 w-full rounded-md" />
            ) : topDrivers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                {t("dashboard.topDriversEmpty")}
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {topDrivers.map((d, i) => (
                  <li key={d.driverId} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 w-5 text-center font-bold text-muted-foreground">{i + 1}</span>
                      <span className="truncate font-medium text-foreground">{d.name}</span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold text-foreground">{formatCurrency(d.gross)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatNumber(d.loads)} {t("dashboard.loads")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">{t("dashboard.driverStats")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isDispatcher ? t("dashboard.subtitleDispatcher") : t("dashboard.driverStatsCompany")}
              </p>
            </div>
            <div className="flex flex-col sm:items-end">
              <EtLiveClock
                variant="full"
                showLabel
                className="sm:text-right"
                data-testid="dashboard-live-clock"
              />
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
                total={visibleOnStatusboard.length}
                statusCounts={driverStatusCounts}
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
                  weekStart={driversToday.weekStart}
                  groupByDispatcher={groupStatusboardByDispatcher}
                  editorUserId={me?.id}
                  editorRole={me?.role}
                  scopedDispatcherId={todayDispatcherId}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
