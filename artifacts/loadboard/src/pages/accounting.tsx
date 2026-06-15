import { useState } from "react";
import { useGetAccountingSummary, useListLoads } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { DollarSign, AlertTriangle, TrendingUp, Clock, Pencil, Check } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fmt = (n: number = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function SummaryCard({
  label, value, icon: Icon, color, subLabel, subValue
}: {
  label: string; value: string; icon: React.ElementType; color: string;
  subLabel?: string; subValue?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
            <p className="text-xl font-bold text-[#1A3C5E]">{value}</p>
            {subLabel && <p className="text-xs text-gray-400 mt-1">{subLabel}: <span className="font-semibold">{subValue}</span></p>}
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditPaymentModal({
  load,
  onClose,
}: {
  load: any;
  onClose: () => void;
}) {
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
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/loads"] });
      qc.invalidateQueries({ queryKey: ["/api/accounting"] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#1A3C5E]">
            Update Payment — <span className="text-[#2196F3]">{load.loadNumber}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rate + Reimb. (ref.)</Label>
              <Input value={fmt((load.rate || 0) + (load.reimbursement || 0))} disabled className="bg-gray-50" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex h-10 items-center">
                <LoadStatusBadge status={load.status} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiced">Invoiced Amount ($)</Label>
              <Input
                id="invoiced"
                type="number"
                step="0.01"
                value={invoiced}
                onChange={(e) => setInvoiced(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paid">Broker Paid ($)</Label>
              <Input
                id="paid"
                type="number"
                step="0.01"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          {invoiced && paid && Number(paid) < Number(invoiced) && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md p-3 text-red-700 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Broker underpaid by {fmt(Number(invoiced) - Number(paid))}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any billing notes…"
            />
          </div>
          {mutation.error && <p className="text-sm text-red-600">Failed to save. Try again.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#1A3C5E] hover:bg-[#122A42] text-white" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Accounting() {
  const [editLoad, setEditLoad] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState("Delivered");
  const [search, setSearch] = useState("");

  const { data: summary, isLoading: summaryLoading } = useGetAccountingSummary({});
  const { data: loadsData, isLoading: loadsLoading } = useListLoads({ status: statusFilter === "all" ? undefined : statusFilter as any, search, limit: 100 });

  const loads = loadsData?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1A3C5E]">Accounting</h1>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Invoiced"
            value={fmt(summary?.totalInvoiced)}
            icon={DollarSign}
            color="bg-blue-50 text-blue-600"
          />
          <SummaryCard
            label="Broker Paid This Week"
            value={fmt(summary?.brokerPaidThisWeek)}
            icon={TrendingUp}
            color="bg-green-50 text-green-600"
          />
          <SummaryCard
            label="Outstanding"
            value={fmt(summary?.outstanding)}
            icon={Clock}
            color="bg-orange-50 text-orange-600"
          />
          <SummaryCard
            label="Underpayment Issues"
            value={String(summary?.diffIssues ?? 0)}
            icon={AlertTriangle}
            color="bg-red-50 text-red-600"
            subLabel="Loads with B-I diff"
            subValue={summary?.diffIssues ? "⚠ Action needed" : "✓ All clear"}
          />
        </div>
      )}

      {/* Loads Table */}
      <Card className="overflow-hidden shadow-sm border-gray-200">
        <CardHeader className="pb-0 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-3 pb-4">
            <div className="relative flex-1">
              <Input
                placeholder="Search load #, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-gray-50 border-gray-200"
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
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b">
              <tr>
                <th className="px-4 py-3">Load #</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Broker</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">PU Date</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Reimb.</th>
                <th className="px-4 py-3 text-right">Invoiced</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">B-I Diff</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadsLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : loads.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-500">No loads found.</td>
                </tr>
              ) : (
                loads.map((load) => {
                  const gross = (load.rate || 0) + (load.reimbursement || 0);
                  const biDiff = load.biDiff ?? null;
                  const irDiff = load.irDiff ?? null;
                  const hasIssue = biDiff !== null && biDiff < 0;

                  return (
                    <tr key={load.id} className={`hover:bg-blue-50/30 transition-colors ${hasIssue ? "bg-red-50/30" : ""}`}>
                      <td className="px-4 py-3 font-bold text-[#1A3C5E] whitespace-nowrap">{load.loadNumber}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{load.driver?.fullName || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{load.broker?.name || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {load.originCity}, {load.originState} → {load.destCity}, {load.destState}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(load.puDate)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmt(load.rate)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{load.reimbursement > 0 ? fmt(load.reimbursement) : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {load.invoicedAmount !== null ? (
                          <div>
                            <div className="font-semibold">{fmt(load.invoicedAmount)}</div>
                            {irDiff !== null && (
                              <div className={`text-xs ${irDiff < 0 ? "text-red-600" : "text-green-600"}`}>
                                {irDiff >= 0 ? "+" : ""}{fmt(irDiff)} I-R
                              </div>
                            )}
                          </div>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {load.brokerPaid !== null ? (
                          <div className="flex items-center justify-end gap-1">
                            {!hasIssue && <Check className="h-3.5 w-3.5 text-green-600" />}
                            <span className={`font-semibold ${hasIssue ? "text-red-600" : "text-green-700"}`}>
                              {fmt(load.brokerPaid)}
                            </span>
                          </div>
                        ) : <span className="text-gray-400">Pending</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {biDiff !== null ? (
                          <span className={`font-semibold flex items-center justify-end gap-1 ${biDiff < 0 ? "text-red-600" : "text-green-700"}`}>
                            {biDiff < 0 && <AlertTriangle className="h-3 w-3" />}
                            {biDiff >= 0 ? "+" : ""}{fmt(biDiff)}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center"><LoadStatusBadge status={load.status} /></td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#1A3C5E] hover:bg-blue-50 whitespace-nowrap"
                          onClick={() => setEditLoad(load)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editLoad && <EditPaymentModal load={editLoad} onClose={() => setEditLoad(null)} />}
    </div>
  );
}
