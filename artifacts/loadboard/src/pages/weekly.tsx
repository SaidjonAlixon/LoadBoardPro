import { useState } from "react";
import { useListWeeks, useGetWeeklyView } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { ChevronDown, Truck, DollarSign, Route, TrendingUp, Users } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fmt = (n: number = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtRpm = (n: number = 0) => `$${n.toFixed(2)}/mi`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
            <p className="text-xl font-bold text-[#1A3C5E]">{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DriverBlock({ block }: { block: any }) {
  const [expanded, setExpanded] = useState(true);
  const totalGross = (block.loads as any[]).reduce((s: number, l: any) => s + (l.rate ?? 0) + (l.reimbursement ?? 0), 0);
  const totalMiles = (block.loads as any[]).reduce((s: number, l: any) => s + (l.mileage ?? 0), 0);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between p-4 bg-[#1A3C5E] text-white cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="bg-[#2196F3] rounded-full p-1.5">
            <Truck className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-sm">{block.driver.fullName}</p>
            <p className="text-xs text-blue-200">
              {block.driver.driverType} {block.driver.truckNumber ? `• #${block.driver.truckNumber}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-xs text-blue-200">Loads</p>
            <p className="font-bold">{block.loads.length}</p>
          </div>
          <div>
            <p className="text-xs text-blue-200">Miles</p>
            <p className="font-bold">{totalMiles.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-blue-200">Gross</p>
            <p className="font-bold">{fmt(totalGross)}</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-blue-200 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b">
              <tr>
                <th className="px-4 py-3">Load #</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">PU</th>
                <th className="px-4 py-3">DEL</th>
                <th className="px-4 py-3 text-right">Miles</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">RPM</th>
                <th className="px-4 py-3 text-right">Reimb.</th>
                <th className="px-4 py-3">Broker</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Invoiced</th>
                <th className="px-4 py-3 text-right">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(block.loads as any[]).map((load: any) => {
                const biDiff = load.brokerPaid !== null && load.invoicedAmount !== null
                  ? load.brokerPaid - load.invoicedAmount
                  : null;
                return (
                  <tr key={load.id} className={`hover:bg-blue-50/40 ${biDiff !== null && biDiff < 0 ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-3 font-bold text-[#1A3C5E] whitespace-nowrap">{load.loadNumber}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {load.originCity}, {load.originState} → {load.destCity}, {load.destState}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(load.puDate)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(load.delDate)}</td>
                    <td className="px-4 py-3 text-right">{load.mileage.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(load.rate)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{load.rpm ? fmtRpm(load.rpm) : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{load.reimbursement > 0 ? fmt(load.reimbursement) : "—"}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{(load.broker as any)?.name || "—"}</td>
                    <td className="px-4 py-3 text-center"><LoadStatusBadge status={load.status} /></td>
                    <td className="px-4 py-3 text-right">{load.invoicedAmount !== null ? fmt(load.invoicedAmount) : "—"}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${biDiff !== null && biDiff < 0 ? "text-red-600" : ""}`}>
                      {load.brokerPaid !== null ? fmt(load.brokerPaid) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function WeeklyView() {
  const { data: weeks, isLoading: weeksLoading } = useListWeeks({});
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  const activeWeek = selectedWeek ?? (weeks?.[0]?.weekStart ?? null);
  const { data: weekData, isLoading: weekLoading } = useGetWeeklyView(activeWeek ?? "", {
    query: { enabled: !!activeWeek } as any,
  });

  const formatWeekLabel = (weekStart: string) => {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  };

  const kpi = weekData?.kpi;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#1A3C5E]">Weekly View</h1>
        <div className="w-full sm:w-72">
          {weeksLoading ? (
            <Skeleton className="h-10 w-full rounded-md" />
          ) : (
            <Select value={activeWeek ?? ""} onValueChange={setSelectedWeek}>
              <SelectTrigger className="border-gray-200 bg-white shadow-sm">
                <SelectValue placeholder="Select week…" />
              </SelectTrigger>
              <SelectContent>
                {weeks?.map((w) => (
                  <SelectItem key={w.weekStart} value={w.weekStart}>
                    {formatWeekLabel(w.weekStart)} — {w.loadCount} loads
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* KPI Row */}
      {weekLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : kpi ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard label="Total Gross" value={fmt(kpi.totalGross)} icon={DollarSign} color="bg-blue-50 text-blue-600" />
          <KpiCard label="Total Miles" value={(kpi.totalMileage ?? 0).toLocaleString()} icon={Route} color="bg-indigo-50 text-indigo-600" />
          <KpiCard label="Avg RPM" value={fmtRpm(kpi.avgRpm)} icon={TrendingUp} color="bg-green-50 text-green-600" />
          <KpiCard label="Active Drivers" value={String(kpi.activeDrivers)} icon={Users} color="bg-orange-50 text-orange-600" />
          <KpiCard label="OO / CD" value={`${kpi.ooCount} / ${kpi.cdCount}`} icon={Truck} color="bg-purple-50 text-purple-600" />
        </div>
      ) : null}

      {/* Driver Blocks */}
      {weekLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-14 w-full rounded-none" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : weekData?.drivers?.length ? (
        <div className="space-y-4">
          {weekData.drivers.map((block, i) => (
            <DriverBlock key={block.driver.id ?? i} block={block} />
          ))}
        </div>
      ) : activeWeek ? (
        <Card>
          <CardContent className="p-12 text-center text-gray-500">
            No loads found for this week.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-gray-500">
            No weeks with loads yet. Add loads to see the weekly view.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
