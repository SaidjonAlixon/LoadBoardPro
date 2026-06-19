import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetKpi,
  useGetDispatcherRanking,
  useGetStatusBreakdown,
  useListLoads,
  useListWeeks,
  useGetMe,
  type User,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { DashboardPeriodToolbar } from "@/components/dashboard-period-toolbar";
import { DriverStatusChips } from "@/components/driver-status-chips";
import { DriverTodayPanel } from "@/components/driver-today-panel";
import {
  fetchDriversToday,
  driversForChipFilter,
  type DriverChipFilter,
} from "@/lib/drivers-today";
import { DollarSign, Route, TrendingUp, Divide } from "lucide-react";
import { Link } from "wouter";
import { useI18n, translateLoadStatus } from "@/lib/i18n";
import { toast } from "sonner";
import {
  buildDashboardFilterParams,
  formatWeekRangeLabel,
  type DashboardDateRange,
} from "@/lib/date-range";
import {
  exportDashboardExcel,
  fetchAllFilteredLoads,
  getDashboardLoadsExportLabels,
} from "@/lib/export-dashboard-excel";

const STATUS_COLORS: Record<string, string> = {
  Booked: "#2196F3",
  InQM: "#E65100",
  PickedUp: "#E65100",
  Delivered: "#2E7D32",
  Canceled: "#C62828",
  Completed: "#00695C",
  NeedRevRC: "#6A1B9A",
  Issue: "#F57F17",
  Checked: "#00838F",
  Invoiced: "#4527A0",
  Reinvoiced: "#6A1B9A",
  BrokerPaid: "#2E7D32",
};

const DATE_RANGE_KEYS: Record<DashboardDateRange, string> = {
  thisWeek: "dashboard.thisWeek",
  lastWeek: "dashboard.lastWeek",
  thisMonth: "dashboard.thisMonth",
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
  const [dateRange, setDateRange] = useState<DashboardDateRange>("thisWeek");
  const [weekFilter, setWeekFilter] = useState("all");
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
        dateRange,
        weekFilter,
        dispatcherFilter: isDispatcher ? "all" : dispatcherFilter,
      }),
    [dateRange, weekFilter, dispatcherFilter, isDispatcher],
  );

  const { data: kpi, isLoading: kpiLoading } = useGetKpi(filterParams);
  const { data: ranking, isLoading: rankingLoading } = useGetDispatcherRanking(filterParams);
  const { data: statusBreakdown, isLoading: statusLoading } = useGetStatusBreakdown(filterParams);
  const { data: recentLoads, isLoading: loadsLoading } = useListLoads({
    ...filterParams,
    limit: 5,
  });
  const { data: weeks } = useListWeeks({});
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
    if (weekFilter !== "all") {
      return t("dashboard.filteredByWeek", { range: formatWeekRangeLabel(weekFilter, formatDate) });
    }
    return t(DATE_RANGE_KEYS[dateRange]);
  }, [weekFilter, dateRange, formatDate, t]);

  const selectedDispatcherName = useMemo(() => {
    if (dispatcherFilter === "all") return null;
    const d = dispatchers?.find((u) => u.id === dispatcherFilter);
    return d?.name || d?.email || null;
  }, [dispatcherFilter, dispatchers]);

  const handleDateRange = (range: DashboardDateRange) => {
    setDateRange(range);
    setWeekFilter("all");
  };

  const handleWeekChange = (value: string) => {
    setWeekFilter(value);
  };

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
          statusBreakdown: statusBreakdown ?? [],
          loads,
          formatCurrency,
          formatDate,
          translateStatus: (s) => translateLoadStatus(t, s),
        },
        {
          filePrefix: "dashboard",
          sheets: {
            summary: t("dashboard.exportSheetSummary"),
            performance: isDispatcher ? t("dashboard.myPerformance") : t("dashboard.leaderboard"),
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
          dateRange={dateRange}
          weekFilter={weekFilter}
          activeWeeks={weeks ?? []}
          onDateRange={handleDateRange}
          onWeekChange={handleWeekChange}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-lg font-bold text-foreground">
              {isDispatcher ? t("dashboard.myPerformance") : t("dashboard.leaderboard")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isDispatcher
                ? t("dashboard.myPerformancePeriod", { period: periodLabel })
                : t("dashboard.leaderboardPeriod", { period: periodLabel })}
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
                      <tr key={r.dispatcherId} className="border-b hover:bg-muted/50">
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

        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-lg font-bold text-foreground">{t("dashboard.loadStatus")}</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex justify-center items-center h-64">
            {statusLoading ? <Skeleton className="h-48 w-48 rounded-full" /> : statusBreakdown && statusBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="status"
                  >
                    {statusBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || '#1A3C5E'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [t("dashboard.chartLoads", { count: value as number }), t("dashboard.chartCount")]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted-foreground">{t("dashboard.noStatus")}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 border-b border-border flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-bold text-foreground">{t("dashboard.recentLoads")}</CardTitle>
          <Link href="/loads">
            <Button variant="ghost" size="sm" className="text-accent font-medium" data-testid="link-view-all-loads">{t("common.viewAll")}</Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {loadsLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : recentLoads?.data && recentLoads.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                  <tr>
                    <th className="px-6 py-3">{t("dashboard.loadNumber")}</th>
                    <th className="px-6 py-3">{t("dashboard.driver")}</th>
                    <th className="px-6 py-3">{t("dashboard.route")}</th>
                    <th className="px-6 py-3">{t("dashboard.puDate")}</th>
                    <th className="px-6 py-3">{t("dashboard.rate")}</th>
                    <th className="px-6 py-3">{t("dashboard.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoads.data.map((load) => (
                    <tr key={load.id} className="border-b hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => window.location.href = `/loads/${load.id}`}>
                      <td className="px-6 py-4 font-semibold text-foreground">{load.loadNumber}</td>
                      <td className="px-6 py-4">{load.driver?.fullName || t("common.unassigned")}</td>
                      <td className="px-6 py-4 truncate max-w-[200px]">{load.originCity}, {load.originState} → {load.destCity}, {load.destState}</td>
                      <td className="px-6 py-4">{formatDate(load.puDate)}</td>
                      <td className="px-6 py-4 font-medium">{formatCurrency(load.rate)}</td>
                      <td className="px-6 py-4"><LoadStatusBadge status={load.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
             <div className="p-8 text-center text-muted-foreground">{t("dashboard.noRecentLoads")}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
