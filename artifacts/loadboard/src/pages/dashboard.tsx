import { useState } from "react";
import { useGetKpi, useGetDispatcherRanking, useGetStatusBreakdown, useListLoads } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { DollarSign, Route, TrendingUp, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  Booked: "#2196F3",
  PickedUp: "#E65100",
  Delivered: "#2E7D32",
  Canceled: "#C62828"
};

export default function Dashboard() {
  const [dateRange, setDateRange] = useState("This Week");

  const { data: kpi, isLoading: kpiLoading } = useGetKpi({});
  const { data: ranking, isLoading: rankingLoading } = useGetDispatcherRanking({});
  const { data: statusBreakdown, isLoading: statusLoading } = useGetStatusBreakdown({});
  const { data: recentLoads, isLoading: loadsLoading } = useListLoads({ limit: 5 });

  const formatCurrency = (amount: number = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#1A3C5E]" data-testid="dashboard-title">Command Center</h1>
        <div className="flex space-x-2 bg-white p-1 rounded-lg shadow-sm border border-gray-100">
          {["This Week", "Last Week", "This Month"].map((range) => (
            <Button
              key={range}
              variant={dateRange === range ? "default" : "ghost"}
              size="sm"
              onClick={() => setDateRange(range)}
              className={dateRange === range ? "bg-[#1A3C5E] text-white" : "text-gray-600"}
              data-testid={`filter-btn-${range.replace(/\s+/g, '-')}`}
            >
              {range}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Gross</p>
                {kpiLoading ? <Skeleton className="h-8 w-24" /> : (
                  <h3 className="text-2xl font-bold text-[#1A3C5E]" data-testid="kpi-gross">{formatCurrency(kpi?.totalGross)}</h3>
                )}
              </div>
              <div className="p-2 bg-blue-50 rounded-lg"><DollarSign className="h-5 w-5 text-[#2196F3]" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Miles</p>
                {kpiLoading ? <Skeleton className="h-8 w-24" /> : (
                  <h3 className="text-2xl font-bold text-[#1A3C5E]" data-testid="kpi-miles">{kpi?.totalMiles?.toLocaleString() || 0}</h3>
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
                <p className="text-sm font-medium text-gray-500 mb-1">Avg RPM</p>
                {kpiLoading ? <Skeleton className="h-8 w-24" /> : (
                  <h3 className="text-2xl font-bold text-[#1A3C5E]" data-testid="kpi-rpm">{formatCurrency(kpi?.avgRpm)}</h3>
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
                <p className="text-sm font-medium text-gray-500 mb-1">Unpaid Diff</p>
                {kpiLoading ? <Skeleton className="h-8 w-24" /> : (
                  <h3 className={`text-2xl font-bold ${(kpi?.unpaidDiff || 0) > 0 ? 'text-[#C62828]' : 'text-[#1A3C5E]'}`} data-testid="kpi-unpaid">
                    {formatCurrency(kpi?.unpaidDiff)}
                  </h3>
                )}
              </div>
              <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle className="h-5 w-5 text-[#C62828]" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 border-b border-gray-100">
            <CardTitle className="text-lg font-bold text-[#1A3C5E]">Dispatcher Leaderboard</CardTitle>
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
                  <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b">
                    <tr>
                      <th className="px-6 py-3">Rank</th>
                      <th className="px-6 py-3">Dispatcher</th>
                      <th className="px-6 py-3">Loads</th>
                      <th className="px-6 py-3">Gross</th>
                      <th className="px-6 py-3">Avg RPM</th>
                      <th className="px-6 py-3">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr key={r.dispatcherId} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                        </td>
                        <td className="px-6 py-4 font-semibold text-[#1A3C5E]">{r.dispatcherName}</td>
                        <td className="px-6 py-4">{r.loads}</td>
                        <td className="px-6 py-4">{formatCurrency(r.gross)}</td>
                        <td className="px-6 py-4">{formatCurrency(r.avgRpm)}</td>
                        <td className="px-6 py-4 font-bold text-[#2196F3]">{r.kpiScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">No ranking data available.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 border-b border-gray-100">
            <CardTitle className="text-lg font-bold text-[#1A3C5E]">Load Status</CardTitle>
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
                  <Tooltip formatter={(value) => [`${value} Loads`, 'Count']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-gray-500">No status data available.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 border-b border-gray-100 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-bold text-[#1A3C5E]">Recent Loads</CardTitle>
          <Link href="/loads">
            <Button variant="ghost" size="sm" className="text-[#2196F3] font-medium" data-testid="link-view-all-loads">View All</Button>
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
                <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b">
                  <tr>
                    <th className="px-6 py-3">Load #</th>
                    <th className="px-6 py-3">Driver</th>
                    <th className="px-6 py-3">Route</th>
                    <th className="px-6 py-3">PU Date</th>
                    <th className="px-6 py-3">Rate</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoads.data.map((load) => (
                    <tr key={load.id} className="border-b hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => window.location.href = `/loads/${load.id}`}>
                      <td className="px-6 py-4 font-semibold text-[#1A3C5E]">{load.loadNumber}</td>
                      <td className="px-6 py-4">{load.driver?.fullName || "Unassigned"}</td>
                      <td className="px-6 py-4 truncate max-w-[200px]">{load.originCity}, {load.originState} → {load.destCity}, {load.destState}</td>
                      <td className="px-6 py-4">{new Date(load.puDate).toLocaleDateString()}</td>
                      <td className="px-6 py-4 font-medium">{formatCurrency(load.rate)}</td>
                      <td className="px-6 py-4"><LoadStatusBadge status={load.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
             <div className="p-8 text-center text-gray-500">No recent loads found.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
