import { useState, useEffect } from "react";
import { useListLoads, useListDrivers, useListBrokers } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { LoadStatusBadge } from "@/components/load-status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Filter, AlertTriangle, X } from "lucide-react";
import { useLocation } from "wouter";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const fmt = (n: number = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function getMondayOfWeek(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

interface LoadForm {
  loadNumber: string;
  driverId: string;
  brokerId: string;
  puDate: string;
  delDate: string;
  originCity: string;
  originState: string;
  destCity: string;
  destState: string;
  mileage: string;
  rate: string;
  reimbursement: string;
  status: string;
  dispatchNotes: string;
  weekStart: string;
}

const EMPTY: LoadForm = {
  loadNumber: "",
  driverId: "",
  brokerId: "",
  puDate: "",
  delDate: "",
  originCity: "",
  originState: "",
  destCity: "",
  destState: "",
  mileage: "",
  rate: "",
  reimbursement: "",
  status: "Booked",
  dispatchNotes: "",
  weekStart: "",
};

function AddLoadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<LoadForm>(EMPTY);
  const qc = useQueryClient();

  const { data: drivers } = useListDrivers({});
  const { data: brokers } = useListBrokers({});

  // Auto-compute weekStart from puDate
  useEffect(() => {
    if (form.puDate) {
      setForm((f) => ({ ...f, weekStart: getMondayOfWeek(form.puDate) }));
    }
  }, [form.puDate]);

  // Auto-fill delDate from puDate if empty
  useEffect(() => {
    if (form.puDate && !form.delDate) {
      setForm((f) => ({ ...f, delDate: form.puDate }));
    }
  }, [form.puDate]);

  const rpm =
    form.rate && form.mileage && Number(form.mileage) > 0
      ? Number(form.rate) / Number(form.mileage)
      : null;

  const mutation = useMutation({
    mutationFn: async (data: LoadForm) => {
      const res = await fetch("/api/loads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          loadNumber: data.loadNumber,
          driverId: data.driverId || null,
          brokerId: data.brokerId || null,
          puDate: data.puDate,
          delDate: data.delDate || data.puDate,
          originCity: data.originCity,
          originState: data.originState,
          destCity: data.destCity,
          destState: data.destState,
          mileage: Number(data.mileage),
          rate: Number(data.rate),
          reimbursement: Number(data.reimbursement) || 0,
          status: data.status,
          dispatchNotes: data.dispatchNotes || null,
          weekStart: data.weekStart || getMondayOfWeek(data.puDate),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create load");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/loads"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics"] });
      setForm(EMPTY);
      onClose();
    },
  });

  const set =
    (k: keyof LoadForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const handleClose = () => {
    setForm(EMPTY);
    mutation.reset();
    onClose();
  };

  const activeDrivers = (drivers ?? []).filter((d) => d.isActive);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#1A3C5E] text-xl">Add New Load</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Load # + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="loadNumber">
                Load # <span className="text-red-500">*</span>
              </Label>
              <Input
                id="loadNumber"
                value={form.loadNumber}
                onChange={set("loadNumber")}
                required
                placeholder="e.g. CY-240700"
                className="border-gray-200 focus:border-[#1A3C5E]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Booked">Booked</SelectItem>
                  <SelectItem value="PickedUp">Picked Up</SelectItem>
                  <SelectItem value="Delivered">Delivered</SelectItem>
                  <SelectItem value="Canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Driver + Broker */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Driver</Label>
              <Select
                value={form.driverId}
                onValueChange={(v) => setForm((f) => ({ ...f, driverId: v === "_none" ? "" : v }))}
              >
                <SelectTrigger className="border-gray-200">
                  <SelectValue placeholder="Select driver…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Unassigned —</SelectItem>
                  {activeDrivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fullName}
                      {d.truckNumber ? ` (#${d.truckNumber})` : ""}
                      <span className="text-gray-400 ml-1 text-xs">{d.driverType}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Broker</Label>
              <Select
                value={form.brokerId}
                onValueChange={(v) => setForm((f) => ({ ...f, brokerId: v === "_none" ? "" : v }))}
              >
                <SelectTrigger className="border-gray-200">
                  <SelectValue placeholder="Select broker…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {(brokers ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {b.mcNumber ? ` (${b.mcNumber})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="puDate">
                Pickup Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="puDate"
                type="date"
                value={form.puDate}
                onChange={set("puDate")}
                required
                className="border-gray-200 focus:border-[#1A3C5E]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delDate">
                Delivery Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="delDate"
                type="date"
                value={form.delDate}
                onChange={set("delDate")}
                required
                className="border-gray-200 focus:border-[#1A3C5E]"
              />
            </div>
          </div>

          {/* Origin */}
          <div>
            <Label className="text-sm font-semibold text-gray-700 mb-2 block">
              Origin
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="originCity" className="text-xs text-gray-500">
                  City <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="originCity"
                  value={form.originCity}
                  onChange={set("originCity")}
                  required
                  placeholder="Dallas"
                  className="border-gray-200 focus:border-[#1A3C5E]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="originState" className="text-xs text-gray-500">
                  State <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.originState}
                  onValueChange={(v) => setForm((f) => ({ ...f, originState: v }))}
                >
                  <SelectTrigger className="border-gray-200">
                    <SelectValue placeholder="ST" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {US_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Destination */}
          <div>
            <Label className="text-sm font-semibold text-gray-700 mb-2 block">
              Destination
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="destCity" className="text-xs text-gray-500">
                  City <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="destCity"
                  value={form.destCity}
                  onChange={set("destCity")}
                  required
                  placeholder="Los Angeles"
                  className="border-gray-200 focus:border-[#1A3C5E]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="destState" className="text-xs text-gray-500">
                  State <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.destState}
                  onValueChange={(v) => setForm((f) => ({ ...f, destState: v }))}
                >
                  <SelectTrigger className="border-gray-200">
                    <SelectValue placeholder="ST" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {US_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Mileage + Rate + Reimbursement */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mileage">
                Mileage <span className="text-red-500">*</span>
              </Label>
              <Input
                id="mileage"
                type="number"
                min="1"
                step="0.1"
                value={form.mileage}
                onChange={set("mileage")}
                required
                placeholder="1432"
                className="border-gray-200 focus:border-[#1A3C5E]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate">
                Rate ($) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rate"
                type="number"
                min="0"
                step="0.01"
                value={form.rate}
                onChange={set("rate")}
                required
                placeholder="5200.00"
                className="border-gray-200 focus:border-[#1A3C5E]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reimbursement">Reimbursement ($)</Label>
              <Input
                id="reimbursement"
                type="number"
                min="0"
                step="0.01"
                value={form.reimbursement}
                onChange={set("reimbursement")}
                placeholder="0.00"
                className="border-gray-200 focus:border-[#1A3C5E]"
              />
            </div>
          </div>

          {/* Live RPM preview */}
          {rpm !== null && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5">
              <span className="text-xs text-blue-600 font-medium">Live RPM:</span>
              <span className="text-base font-bold text-[#1A3C5E]">{fmt(rpm)}/mi</span>
              <span className="text-xs text-blue-400 ml-auto">
                {fmt(Number(form.rate))} ÷ {Number(form.mileage).toLocaleString()} mi
              </span>
            </div>
          )}

          {/* Week Start (auto) */}
          {form.weekStart && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium">Week of:</span>
              <span className="text-[#1A3C5E] font-semibold">
                {new Date(form.weekStart).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span className="text-gray-400">(auto-computed from pickup date)</span>
            </div>
          )}

          {/* Dispatch Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="dispatchNotes">Dispatch Notes</Label>
            <Textarea
              id="dispatchNotes"
              value={form.dispatchNotes}
              onChange={set("dispatchNotes")}
              placeholder="Any special instructions, pickup details, contact info…"
              rows={3}
              className="border-gray-200 focus:border-[#1A3C5E] resize-none"
            />
          </div>

          {mutation.error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {(mutation.error as Error).message || "Failed to create load. Please try again."}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="border-gray-200">
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#1A3C5E] hover:bg-[#122A42] text-white min-w-[120px]"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Adding…" : "Add Load"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Filter Panel ────────────────────────────────────────────────────────────

interface Filters {
  status: string;
  driverId: string;
  brokerId: string;
}

function FilterPanel({
  open,
  onClose,
  filters,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const { data: drivers } = useListDrivers({});
  const { data: brokers } = useListBrokers({});
  const [local, setLocal] = useState<Filters>(filters);

  if (!open) return null;

  const hasActive = local.status !== "" || local.driverId !== "" || local.brokerId !== "";

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[#1A3C5E] text-sm">Filters</p>
        <div className="flex items-center gap-2">
          {hasActive && (
            <button
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              onClick={() => {
                const cleared = { status: "", driverId: "", brokerId: "" };
                setLocal(cleared);
                onChange(cleared);
              }}
            >
              Clear all
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select
            value={local.status}
            onValueChange={(v) => {
              const next = { ...local, status: v === "_all" ? "" : v };
              setLocal(next);
              onChange(next);
            }}
          >
            <SelectTrigger className="border-gray-200 h-9 text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All statuses</SelectItem>
              <SelectItem value="Booked">Booked</SelectItem>
              <SelectItem value="PickedUp">Picked Up</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
              <SelectItem value="Canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Driver</Label>
          <Select
            value={local.driverId}
            onValueChange={(v) => {
              const next = { ...local, driverId: v === "_all" ? "" : v };
              setLocal(next);
              onChange(next);
            }}
          >
            <SelectTrigger className="border-gray-200 h-9 text-sm">
              <SelectValue placeholder="All drivers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All drivers</SelectItem>
              {(drivers ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Broker</Label>
          <Select
            value={local.brokerId}
            onValueChange={(v) => {
              const next = { ...local, brokerId: v === "_all" ? "" : v };
              setLocal(next);
              onChange(next);
            }}
          >
            <SelectTrigger className="border-gray-200 h-9 text-sm">
              <SelectValue placeholder="All brokers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All brokers</SelectItem>
              {(brokers ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LoadsList() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({ status: "", driverId: "", brokerId: "" });

  const activeFilters = Object.values(filters).filter(Boolean).length;

  const { data: loadsData, isLoading } = useListLoads({
    search: search || undefined,
    status: (filters.status as any) || undefined,
    driverId: filters.driverId || undefined,
    brokerId: filters.brokerId || undefined,
    limit: 100,
  });

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#1A3C5E]" data-testid="page-title-loads">
          Loads Board
        </h1>
        <Button
          className="bg-[#2196F3] hover:bg-[#1E88E5] text-white shadow-sm"
          onClick={() => setAddOpen(true)}
          data-testid="button-add-load"
        >
          <Plus className="h-4 w-4 mr-2" /> Add Load
        </Button>
      </div>

      {/* Search + Filter bar */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search load #, city, driver…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-gray-200 shadow-sm focus:border-[#1A3C5E]"
              data-testid="input-search-loads"
            />
          </div>
          <Button
            variant="outline"
            className={`border-gray-200 shadow-sm gap-2 ${activeFilters > 0 ? "border-[#1A3C5E] text-[#1A3C5E] bg-blue-50" : "text-gray-600"}`}
            onClick={() => setFilterOpen((v) => !v)}
            data-testid="button-filter-loads"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilters > 0 && (
              <span className="bg-[#1A3C5E] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {activeFilters}
              </span>
            )}
          </Button>
        </div>

        <FilterPanel
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onChange={setFilters}
        />
      </div>

      {/* Table */}
      <Card className="flex-1 flex flex-col overflow-hidden shadow-sm border-gray-200">
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-semibold">Load #</th>
                <th className="px-6 py-4 font-semibold">Driver</th>
                <th className="px-6 py-4 font-semibold">Broker</th>
                <th className="px-6 py-4 font-semibold">Route</th>
                <th className="px-6 py-4 font-semibold">Dates</th>
                <th className="px-6 py-4 font-semibold text-right">Rate / RPM</th>
                <th className="px-6 py-4 font-semibold text-right">B-I Diff</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <Skeleton className="h-5 w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : loadsData?.data?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <div className="bg-gray-100 p-4 rounded-full">
                        <Plus className="h-8 w-8 text-gray-300" />
                      </div>
                      <p className="font-medium text-gray-500">No loads found</p>
                      <p className="text-sm">
                        {search || activeFilters > 0
                          ? "Try adjusting your search or filters"
                          : `Click "Add Load" to create your first load`}
                      </p>
                      {!search && !activeFilters && (
                        <Button
                          className="mt-2 bg-[#2196F3] hover:bg-[#1E88E5] text-white"
                          onClick={() => setAddOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Add Load
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                loadsData?.data?.map((load) => {
                  const isNegativeDiff = (load.biDiff ?? 0) < 0;
                  return (
                    <tr
                      key={load.id}
                      onClick={() => setLocation(`/loads/${load.id}`)}
                      className={`hover:bg-blue-50/50 cursor-pointer transition-colors ${isNegativeDiff ? "bg-red-50/30" : ""}`}
                      data-testid={`row-load-${load.id}`}
                    >
                      <td className="px-6 py-4 font-bold text-[#1A3C5E]">{load.loadNumber}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {load.driver?.fullName || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {load.broker?.name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 truncate max-w-[200px]">
                          {load.originCity}, {load.originState} →
                        </div>
                        <div className="text-gray-500 text-xs truncate max-w-[200px]">
                          {load.destCity}, {load.destState}{" "}
                          <span className="text-gray-400">({load.mileage?.toLocaleString()} mi)</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        <div>{new Date(load.puDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(load.delDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-bold text-gray-900">{fmt(load.rate)}</div>
                        <div className="text-xs text-gray-500">{fmt(load.rpm ?? 0)}/mi</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div
                          className={`font-semibold flex items-center justify-end gap-1 ${isNegativeDiff ? "text-red-600" : load.biDiff !== null && load.biDiff !== undefined ? "text-green-700" : "text-gray-400"}`}
                        >
                          {isNegativeDiff && <AlertTriangle className="h-3 w-3" />}
                          {load.biDiff !== null && load.biDiff !== undefined
                            ? fmt(load.biDiff)
                            : "—"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <LoadStatusBadge status={load.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Row count footer */}
        {!isLoading && loadsData && loadsData.total > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex items-center justify-between">
            <span>
              Showing {loadsData.data?.length ?? 0} of {loadsData.total} loads
            </span>
            {activeFilters > 0 && (
              <button
                className="text-[#2196F3] hover:underline"
                onClick={() => setFilters({ status: "", driverId: "", brokerId: "" })}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </Card>

      <AddLoadModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
