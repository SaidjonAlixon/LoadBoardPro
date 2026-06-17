import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { DollarSign, Route, TrendingUp, Users, Divide } from "lucide-react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import {
  buildDashboardFilterParams,
  type DashboardDateRange,
} from "@/lib/date-range";

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

const DATE_RANGES = ["thisWeek", "lastWeek", "thisMonth"] as const;

const DATE_RANGE_KEYS: Record<DashboardDateRange, string> = {
  thisWeek: "dashboard.thisWeek",
  lastWeek: "dashboard.lastWeek",
  thisMonth: "dashboard.thisMonth",
};

async function listDispatchers(): Promise<User[]> {
  const res = await fetch("/api/users/dispatchers", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load dispatchers");
  return res.json();
}

export default function Dashboard() {
  const { t, formatCurrency, formatDate, formatNumber } = useI18n();
  const [dateRange, setDateRange] = useState<DashboardDateRange>("thisWeek");
  const [weekFilter, setWeekFilter] = useState("all");
  const [dispatcherFilter, setDispatcherFilter] = useState("all");

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
  const { data: weeks } = useListWeeks({ query: { enabled: canFilter } });
  const { data: dispatchers } = useQuery({
    queryKey: ["/api/users/dispatchers"],
    queryFn: listDispatchers,
    enabled: canFilter,
  });

  const formatWeekLabel = useCallback(
    (weekStart: string) => {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${formatDate(start)} – ${formatDate(end)}`;
    },
    [formatDate],
  );

  const periodLabel = useMemo(() => {
    if (weekFilter !== "all") {
      return t("dashboard.filteredByWeek", { range: formatWeekLabel(weekFilter) });
    }
    return t(DATE_RANGE_KEYS[dateRange]);
  }, [weekFilter, dateRange, formatWeekLabel, t]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="dashboard-title">
              {t("dashboard.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isDispatcher ? t("dashboard.subtitleDispatcher") : t("dashboard.subtitleCompany")}
            </p>
          </div>
          <div className="flex space-x-2 bg-card p-1 rounded-lg shadow-sm border border-border">
            {DATE_RANGES.map((range) => (
              <Button
                key={range}
                variant={dateRange === range && weekFilter === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleDateRange(range)}
                className={
                  dateRange === range && weekFilter === "all"
                    ? "bg-primary text-white"
                    : "text-muted-foreground"
                }
                data-testid={`filter-btn-${range}`}
              >
                {t(DATE_RANGE_KEYS[range])}
              </Button>
            ))}
          </div>
        </div>

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
            <Select value={weekFilter} onValueChange={handleWeekChange}>
              <SelectTrigger className="w-full sm:w-56 border-border bg-card h-9">
                <SelectValue placeholder={t("dashboard.filterWeek")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.allWeeks")}</SelectItem>
                {(weeks ?? []).map((w) => (
                  <SelectItem key={w.weekStart} value={w.weekStart}>
                    {formatWeekLabel(w.weekStart)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
                <p className="text-xs text-muted-foreground mt-1">
                  {isDispatcher ? t("dashboard.grossPerDriverHintDispatcher") : t("dashboard.grossPerDriverHintCompany")}
                </p>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg"><Divide className="h-5 w-5 text-amber-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="w-full">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  {isDispatcher ? t("dashboard.driverStatsDispatcher") : t("dashboard.driverStatsCompany")}
                </p>
                {kpiLoading ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <div className="space-y-1.5" data-testid="kpi-driver-stats">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("dashboard.driversTotal")}</span>
                      <span className="font-bold text-foreground">{kpi?.totalDrivers ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("dashboard.driversOnLoad")}</span>
                      <span className="font-bold text-[#1976D2]">{kpi?.driversOnLoad ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("dashboard.driversEmpty")}</span>
                      <span className="font-bold text-[#2E7D32]">{kpi?.driversEmpty ?? 0}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-2 bg-orange-50 rounded-lg shrink-0 ml-2"><Users className="h-5 w-5 text-orange-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

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
