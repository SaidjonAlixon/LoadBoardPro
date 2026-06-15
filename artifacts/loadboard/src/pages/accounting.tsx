import { useState, useMemo } from "react";
import { useGetAccountingSummary, useListLoads, useListWeeks } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, AlertTriangle, TrendingUp, Clock, Pencil, Check,
  Download, Search, Calendar, X,
} from "lucide-react";

const fmt = (n: number = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// ─── Summary KPI Card ─────────────────────────────────────────────────────────
function KpiCard({
  label, value, icon: Icon, color, sub, highlight,
}: {
  label: string; value: string; icon: React.ElementType;
  color: string; sub?: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "ring-2 ring-red-300" : ""}>
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
            <p className={`text-xl font-bold ${highlight ? "text-red-600" : "text-[#1A3C5E]"}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Edit Payment Modal ───────────────────────────────────────────────────────
function EditPaymentModal({ load, onClose }: { load: any; onClose: () => void }) {
  const [invoiced, setInvoiced] = useState(load.invoicedAmount?.toString() ?? "");
  const [paid, setPaid] = useState(load.brokerPaid?.toString() ?? "");
  const [notes, setNotes] = useState(load.notes ?? "");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/loads/${load.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          invoicedAmount: invoiced !== "" ? Number(invoiced) : null,
          brokerPaid: paid !== "" ? Number(paid) : null,
          notes: notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/loads"] });
      qc.invalidateQueries({ queryKey: ["/api/accounting"] });
      onClose();
    },
  });

  const gross = (load.rate || 0) + (load.reimbursement || 0);
  const invoicedNum = invoiced ? Number(invoiced) : null;
  const paidNum = paid ? Number(paid) : null;
  const isUnderpaid = invoicedNum !== null && paidNum !== null && paidNum < invoicedNum;
  const biDiff = invoicedNum !== null && paidNum !== null ? paidNum - invoicedNum : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#1A3C5E]">
            Update Payment —{" "}
            <span className="text-[#2196F3]">{load.loadNumber}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Load summary */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Driver</span>
              <span className="font-medium text-gray-800">{load.driver?.fullName || "—"}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Broker</span>
              <span className="font-medium text-gray-800">{load.broker?.name || "—"}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Route</span>
              <span className="font-medium text-gray-800 text-xs">
                {load.originCity}, {load.originState} → {load.destCity}, {load.destState}
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Rate + Reimb.</span>
              <span className="font-bold text-[#1A3C5E]">{fmt(gross)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Status</span>
              <LoadStatusBadge status={load.status} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="invoiced">Invoiced Amount ($)</Label>
              <Input
                id="invoiced"
                type="number"
                step="0.01"
                value={invoiced}
                onChange={(e) => setInvoiced(e.target.value)}
                placeholder="0.00"
                className={invoicedNum !== null && invoicedNum < gross ? "border-orange-300" : ""}
              />
              {invoicedNum !== null && invoicedNum < gross && (
                <p className="text-xs text-orange-500">Below rate + reimb.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paid">Broker Paid ($)</Label>
              <Input
                id="paid"
                type="number"
                step="0.01"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder="0.00"
                className={isUnderpaid ? "border-red-300" : ""}
              />
            </div>
          </div>

          {/* Live diff preview */}
          {biDiff !== null && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${isUnderpaid ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
              {isUnderpaid ? (
                <><AlertTriangle className="h-4 w-4 shrink-0" />
                  Broker underpaid by <strong>{fmt(Math.abs(biDiff))}</strong></>
              ) : (
                <><Check className="h-4 w-4 shrink-0" />
                  Payment matches or exceeds invoice (+{fmt(biDiff)})</>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Internal Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dispute details, payment reference, etc."
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-red-600">Failed to save. Please try again.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#1A3C5E] hover:bg-[#122A42] text-white"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportToCSV(loads: any[]) {
  const headers = [
    "Load #", "Driver", "Broker", "Origin", "Destination",
    "PU Date", "Miles", "Rate", "Reimbursement", "Invoiced", "Broker Paid",
    "I-R Diff", "B-I Diff", "Status", "Notes",
  ];
  const rows = loads.map((l) => [
    l.loadNumber,
    l.driver?.fullName ?? "",
    l.broker?.name ?? "",
    `${l.originCity}, ${l.originState}`,
    `${l.destCity}, ${l.destState}`,
    l.puDate,
    l.mileage,
    l.rate,
    l.reimbursement,
    l.invoicedAmount ?? "",
    l.brokerPaid ?? "",
    l.irDiff ?? "",
    l.biDiff ?? "",
    l.status,
    l.notes ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `accounting_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Accounting() {
  const [editLoad, setEditLoad] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState("Delivered");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [weekFilter, setWeekFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useGetAccountingSummary({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: loadsData, isLoading: loadsLoading } = useListLoads({
    status: statusFilter === "all" ? undefined : (statusFilter as any),
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    weekStart: weekFilter || undefined,
    limit: 200,
  });
  const { data: weeks } = useListWeeks({});

  const loads = loadsData?.data ?? [];

  // Totals
  const totals = useMemo(() => ({
    rate: loads.reduce((s, l) => s + (l.rate || 0), 0),
    reimb: loads.reduce((s, l) => s + (l.reimbursement || 0), 0),
    invoiced: loads.reduce((s, l) => s + (l.invoicedAmount || 0), 0),
    paid: loads.reduce((s, l) => s + (l.brokerPaid || 0), 0),
    biDiff: loads.reduce((s, l) => s + (l.biDiff ?? 0), 0),
  }), [loads]);

  const activeFilters = [dateFrom, dateTo, weekFilter].filter(Boolean).length;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setWeekFilter("");
  };

  const formatWeekLabel = (w: string) => {
    const start = new Date(w);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#1A3C5E]">Accounting</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 border-gray-200 ${showFilters ? "border-[#1A3C5E] text-[#1A3C5E] bg-blue-50" : "text-gray-600"}`}
            onClick={() => setShowFilters((v) => !v)}
          >
            <Calendar className="h-4 w-4" />
            Date Filters
            {activeFilters > 0 && (
              <span className="bg-[#1A3C5E] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {activeFilters}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-gray-200 text-gray-600 hover:text-[#1A3C5E]"
            onClick={() => exportToCSV(loads)}
            disabled={loads.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Date filter panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border-gray-200 h-9"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">To Date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border-gray-200 h-9"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Week</Label>
                <Select value={weekFilter} onValueChange={setWeekFilter}>
                  <SelectTrigger className="border-gray-200 h-9 text-sm">
                    <SelectValue placeholder="All weeks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All weeks</SelectItem>
                    {(weeks ?? []).map((w) => (
                      <SelectItem key={w.weekStart} value={w.weekStart}>
                        {formatWeekLabel(w.weekStart)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-500 hover:text-red-500 gap-1 h-9"
                  onClick={clearFilters}
                >
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Invoiced"
            value={fmt(summary?.totalInvoiced)}
            icon={DollarSign}
            color="bg-blue-50 text-blue-600"
            sub={`${loads.filter((l) => l.invoicedAmount !== null).length} loads invoiced`}
          />
          <KpiCard
            label="Broker Paid This Week"
            value={fmt(summary?.brokerPaidThisWeek)}
            icon={TrendingUp}
            color="bg-green-50 text-green-600"
            sub="Current week payments"
          />
          <KpiCard
            label="Outstanding"
            value={fmt(summary?.outstanding)}
            icon={Clock}
            color="bg-orange-50 text-orange-600"
            sub={`${loads.filter((l) => l.invoicedAmount !== null && l.brokerPaid === null).length} loads awaiting payment`}
            highlight={Boolean(summary?.outstanding && summary.outstanding > 0)}
          />
          <KpiCard
            label="Underpayment Issues"
            value={String(summary?.diffIssues ?? 0)}
            icon={AlertTriangle}
            color="bg-red-50 text-red-600"
            sub={summary?.diffIssues ? "⚠ Action needed" : "✓ All clear"}
            highlight={Boolean(summary?.diffIssues && summary.diffIssues > 0)}
          />
        </div>
      )}

      {/* Loads Table */}
      <Card className="overflow-hidden shadow-sm border-gray-200">
        {/* Search + Status filter bar */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search load #, city, driver…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-gray-50 border-gray-200"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44 border-gray-200 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
              <SelectItem value="Booked">Booked</SelectItem>
              <SelectItem value="PickedUp">Picked Up</SelectItem>
              <SelectItem value="Canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b sticky top-0">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Load #</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Broker</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3 whitespace-nowrap">PU Date</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Reimb.</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Invoiced (I)</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Paid (B)</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">B-I Diff</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadsLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : loads.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-500">
                    No loads found for the selected filters.
                  </td>
                </tr>
              ) : (
                loads.map((load) => {
                  const biDiff = load.biDiff ?? null;
                  const irDiff = load.irDiff ?? null;
                  const hasIssue = biDiff !== null && biDiff < 0;
                  const isPending = load.invoicedAmount !== null && load.brokerPaid === null;

                  return (
                    <tr
                      key={load.id}
                      className={`hover:bg-blue-50/30 transition-colors ${hasIssue ? "bg-red-50/30" : isPending ? "bg-orange-50/20" : ""}`}
                    >
                      <td className="px-4 py-3 font-bold text-[#1A3C5E] whitespace-nowrap">
                        {load.loadNumber}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {load.driver?.fullName || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {load.broker?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {load.originCity}, {load.originState} → {load.destCity}, {load.destState}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {fmtDate(load.puDate)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{fmt(load.rate)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {(load.reimbursement ?? 0) > 0 ? fmt(load.reimbursement) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {load.invoicedAmount !== null ? (
                          <div>
                            <div className="font-semibold">{fmt(load.invoicedAmount)}</div>
                            {irDiff !== null && (
                              <div className={`text-xs ${irDiff < 0 ? "text-orange-500" : "text-green-600"}`}>
                                {irDiff >= 0 ? "+" : ""}{fmt(irDiff)} I-R
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">Not invoiced</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {load.brokerPaid !== null ? (
                          <div className="flex items-center justify-end gap-1">
                            {!hasIssue && <Check className="h-3.5 w-3.5 text-green-600" />}
                            <span className={`font-semibold ${hasIssue ? "text-red-600" : "text-green-700"}`}>
                              {fmt(load.brokerPaid)}
                            </span>
                          </div>
                        ) : (
                          <span className={`text-xs font-medium ${isPending ? "text-orange-500" : "text-gray-400"}`}>
                            {isPending ? "Pending" : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {biDiff !== null ? (
                          <span
                            className={`font-semibold flex items-center justify-end gap-1 ${biDiff < 0 ? "text-red-600" : "text-green-700"}`}
                          >
                            {biDiff < 0 && <AlertTriangle className="h-3 w-3" />}
                            {biDiff >= 0 ? "+" : ""}
                            {fmt(biDiff)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <LoadStatusBadge status={load.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#1A3C5E] hover:bg-blue-50 whitespace-nowrap gap-1"
                          onClick={() => setEditLoad(load)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Totals row */}
            {!loadsLoading && loads.length > 0 && (
              <tfoot>
                <tr className="bg-[#1A3C5E] text-white text-xs font-semibold">
                  <td className="px-4 py-3" colSpan={5}>
                    TOTALS — {loads.length} loads
                  </td>
                  <td className="px-4 py-3 text-right">{fmt(totals.rate)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.reimb)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.invoiced)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.paid)}</td>
                  <td className={`px-4 py-3 text-right ${totals.biDiff < 0 ? "text-red-300" : "text-green-300"}`}>
                    {totals.biDiff >= 0 ? "+" : ""}{fmt(totals.biDiff)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {editLoad && <EditPaymentModal load={editLoad} onClose={() => setEditLoad(null)} />}
    </div>
  );
}
