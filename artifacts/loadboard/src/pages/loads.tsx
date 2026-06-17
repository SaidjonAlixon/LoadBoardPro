import { useState, useEffect } from "react";
import { useListLoads, useListDrivers, useListBrokers, useGetMe } from "@workspace/api-client-react";
import { resolveBrokerIdByName } from "@/lib/resolve-broker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
import { Search, Plus, Filter, X, AlertTriangle } from "lucide-react";
import { useI18n, translateLoadStatus } from "@/lib/i18n";
import { DISPATCHER_LOAD_STATUSES } from "@/lib/load-statuses";
import { LoadsSpreadsheet } from "@/components/loads-spreadsheet";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const DRIVER_TYPE_KEYS: Record<string, string> = {
  OO: "drivers.ooShort",
  CD: "drivers.cdShort",
  Lease: "drivers.lease",
};

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
  brokerName: string;
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
  brokerName: "",
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

const EMPTY_DRIVER: DriverQuickForm = {
  fullName: "",
  driverType: "CD",
  phone: "",
  email: "",
  truckNumber: "",
};

interface DriverQuickForm {
  fullName: string;
  driverType: "OO" | "CD" | "Lease";
  phone: string;
  email: string;
  truckNumber: string;
}

function QuickAddDriverDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (driverId: string) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<DriverQuickForm>(EMPTY_DRIVER);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) setForm(EMPTY_DRIVER);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (data: DriverQuickForm) => {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("drivers.saveFailed"));
      }
      return res.json();
    },
    onSuccess: (driver: { id: string }) => {
      void qc.invalidateQueries({ queryKey: ["/api/drivers"] });
      onCreated(driver.id);
      onClose();
    },
  });

  const set =
    (k: keyof DriverQuickForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("drivers.addDriver")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="quickDriverName">
              {t("drivers.fullName")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="quickDriverName"
              value={form.fullName}
              onChange={set("fullName")}
              required
              placeholder={t("drivers.fullNamePh")}
              className="border-border focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("drivers.driverType")}</Label>
            <Select
              value={form.driverType}
              onValueChange={(v) => setForm((f) => ({ ...f, driverType: v as DriverQuickForm["driverType"] }))}
            >
              <SelectTrigger className="border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OO">{t("drivers.oo")}</SelectItem>
                <SelectItem value="CD">{t("drivers.cd")}</SelectItem>
                <SelectItem value="Lease">{t("drivers.lease")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quickDriverPhone">{t("drivers.phone")}</Label>
              <Input
                id="quickDriverPhone"
                value={form.phone}
                onChange={set("phone")}
                placeholder={t("drivers.phonePh")}
                className="border-border focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickDriverTruck">{t("drivers.truckNumber")}</Label>
              <Input
                id="quickDriverTruck"
                value={form.truckNumber}
                onChange={set("truckNumber")}
                placeholder={t("drivers.truckPh")}
                className="border-border focus:border-primary"
              />
            </div>
          </div>
          {mutation.error && (
            <p className="text-sm text-red-600">{(mutation.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t("common.saving") : t("drivers.addDriver")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddLoadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, formatCurrency, formatDate, formatNumber } = useI18n();
  const [form, setForm] = useState<LoadForm>(EMPTY);
  const [driverAddOpen, setDriverAddOpen] = useState(false);
  const qc = useQueryClient();

  const { data: drivers } = useListDrivers({});

  useEffect(() => {
    if (form.puDate) {
      setForm((f) => ({ ...f, weekStart: getMondayOfWeek(form.puDate) }));
    }
  }, [form.puDate]);

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
      const brokerId = await resolveBrokerIdByName(data.brokerName);
      const res = await fetch("/api/loads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          loadNumber: data.loadNumber,
          driverId: data.driverId || null,
          brokerId,
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
        throw new Error(err.error || t("loads.createFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/loads"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics"] });
      qc.invalidateQueries({ queryKey: ["/api/brokers"] });
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
    setDriverAddOpen(false);
    mutation.reset();
    onClose();
  };

  const activeDrivers = (drivers ?? []).filter((d) => d.isActive);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground text-xl">{t("loads.addNewLoad")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="loadNumber">
                {t("loads.loadNumber")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="loadNumber"
                value={form.loadNumber}
                onChange={set("loadNumber")}
                required
                placeholder={t("loads.loadNumberPh")}
                className="border-border focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("loads.status")}</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPATCHER_LOAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {translateLoadStatus(t, s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("loads.driver")}</Label>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <Select
                    value={form.driverId}
                    onValueChange={(v) => setForm((f) => ({ ...f, driverId: v === "_none" ? "" : v }))}
                  >
                    <SelectTrigger className="border-border">
                      <SelectValue placeholder={t("loads.selectDriver")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("loads.unassigned")}</SelectItem>
                      {activeDrivers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.fullName}
                          {d.truckNumber ? ` (#${d.truckNumber})` : ""}
                          <span className="text-muted-foreground ml-1 text-xs">
                            {t(DRIVER_TYPE_KEYS[d.driverType] ?? d.driverType)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 border-border"
                  title={t("drivers.addDriver")}
                  onClick={() => setDriverAddOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brokerName">{t("loads.broker")}</Label>
              <Input
                id="brokerName"
                value={form.brokerName}
                onChange={set("brokerName")}
                placeholder={t("loads.brokerNamePh")}
                className="border-border focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="puDate">
                {t("loads.pickupDate")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="puDate"
                type="date"
                value={form.puDate}
                onChange={set("puDate")}
                required
                className="border-border focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delDate">
                {t("loads.deliveryDate")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="delDate"
                type="date"
                value={form.delDate}
                onChange={set("delDate")}
                required
                className="border-border focus:border-primary"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold text-foreground mb-2 block">
              {t("loads.origin")}
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="originCity" className="text-xs text-muted-foreground">
                  {t("loads.city")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="originCity"
                  value={form.originCity}
                  onChange={set("originCity")}
                  required
                  placeholder={t("loads.originCityPh")}
                  className="border-border focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="originState" className="text-xs text-muted-foreground">
                  {t("loads.state")} <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.originState}
                  onValueChange={(v) => setForm((f) => ({ ...f, originState: v }))}
                >
                  <SelectTrigger className="border-border">
                    <SelectValue placeholder={t("loads.statePh")} />
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

          <div>
            <Label className="text-sm font-semibold text-foreground mb-2 block">
              {t("loads.destination")}
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="destCity" className="text-xs text-muted-foreground">
                  {t("loads.city")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="destCity"
                  value={form.destCity}
                  onChange={set("destCity")}
                  required
                  placeholder={t("loads.destCityPh")}
                  className="border-border focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="destState" className="text-xs text-muted-foreground">
                  {t("loads.state")} <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.destState}
                  onValueChange={(v) => setForm((f) => ({ ...f, destState: v }))}
                >
                  <SelectTrigger className="border-border">
                    <SelectValue placeholder={t("loads.statePh")} />
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

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mileage">
                {t("loads.mileage")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="mileage"
                type="number"
                min="1"
                step="0.1"
                value={form.mileage}
                onChange={set("mileage")}
                required
                placeholder={t("loads.mileagePh")}
                className="border-border focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate">
                {t("loads.rate")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rate"
                type="number"
                min="0"
                step="0.01"
                value={form.rate}
                onChange={set("rate")}
                required
                placeholder={t("loads.ratePh")}
                className="border-border focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reimbursement">{t("loads.reimbursement")}</Label>
              <Input
                id="reimbursement"
                type="number"
                min="0"
                step="0.01"
                value={form.reimbursement}
                onChange={set("reimbursement")}
                placeholder={t("loads.reimbPh")}
                className="border-border focus:border-primary"
              />
            </div>
          </div>

          {rpm !== null && (
            <div className="flex items-center gap-2 bg-primary/10 border border-blue-100 rounded-lg px-4 py-2.5">
              <span className="text-xs text-blue-600 font-medium">{t("loads.liveRpm")}</span>
              <span className="text-base font-bold text-foreground">{formatCurrency(rpm)}{t("common.perMile")}</span>
              <span className="text-xs text-blue-400 ml-auto">
                {formatCurrency(Number(form.rate))} ÷ {formatNumber(Number(form.mileage))} {t("weekly.miles").toLowerCase()}
              </span>
            </div>
          )}

          {form.weekStart && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">{t("loads.weekOf")}</span>
              <span className="text-foreground font-semibold">
                {formatDate(form.weekStart)}
              </span>
              <span className="text-muted-foreground">{t("loads.weekAuto")}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="dispatchNotes">{t("loads.dispatchNotes")}</Label>
            <Textarea
              id="dispatchNotes"
              value={form.dispatchNotes}
              onChange={set("dispatchNotes")}
              placeholder={t("loads.notesPh")}
              rows={3}
              className="border-border focus:border-primary resize-none"
            />
          </div>

          {mutation.error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {(mutation.error as Error).message || t("loads.createFailedRetry")}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="border-border">
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white min-w-[120px]"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t("loads.adding") : t("loads.addLoad")}
            </Button>
          </DialogFooter>
        </form>

        <QuickAddDriverDialog
          open={driverAddOpen}
          onClose={() => setDriverAddOpen(false)}
          onCreated={(driverId) => setForm((f) => ({ ...f, driverId }))}
        />
      </DialogContent>
    </Dialog>
  );
}

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
  const { t } = useI18n();
  const { data: drivers } = useListDrivers({});
  const { data: brokers } = useListBrokers({});
  const [local, setLocal] = useState<Filters>(filters);

  if (!open) return null;

  const hasActive = local.status !== "" || local.driverId !== "" || local.brokerId !== "";

  return (
    <div className="bg-card border border-border rounded-xl shadow-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-foreground text-sm">{t("common.filters")}</p>
        <div className="flex items-center gap-2">
          {hasActive && (
            <button
              className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
              onClick={() => {
                const cleared = { status: "", driverId: "", brokerId: "" };
                setLocal(cleared);
                onChange(cleared);
              }}
            >
              {t("loads.clearAll")}
            </button>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("loads.status")}</Label>
          <Select
            value={local.status}
            onValueChange={(v) => {
              const next = { ...local, status: v === "_all" ? "" : v };
              setLocal(next);
              onChange(next);
            }}
          >
            <SelectTrigger className="border-border h-9 text-sm">
              <SelectValue placeholder={t("loads.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">{t("loads.allStatuses")}</SelectItem>
              {DISPATCHER_LOAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {translateLoadStatus(t, s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("loads.driver")}</Label>
          <Select
            value={local.driverId}
            onValueChange={(v) => {
              const next = { ...local, driverId: v === "_all" ? "" : v };
              setLocal(next);
              onChange(next);
            }}
          >
            <SelectTrigger className="border-border h-9 text-sm">
              <SelectValue placeholder={t("loads.allDrivers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">{t("loads.allDrivers")}</SelectItem>
              {(drivers ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("loads.broker")}</Label>
          <Select
            value={local.brokerId}
            onValueChange={(v) => {
              const next = { ...local, brokerId: v === "_all" ? "" : v };
              setLocal(next);
              onChange(next);
            }}
          >
            <SelectTrigger className="border-border h-9 text-sm">
              <SelectValue placeholder={t("loads.allBrokers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">{t("loads.allBrokers")}</SelectItem>
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

export default function LoadsList() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({ status: "", driverId: "", brokerId: "" });

  const activeFilters = Object.values(filters).filter(Boolean).length;

  const { data: me } = useGetMe({});
  const userRole = me?.role ?? "dispatcher";

  const { data: brokersData } = useListBrokers({});
  const { data: driversData } = useListDrivers({});
  const { data: loadsData, isLoading } = useListLoads({
    search: search || undefined,
    status: (filters.status as any) || undefined,
    driverId: filters.driverId || undefined,
    brokerId: filters.brokerId || undefined,
    limit: 100,
  });

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-foreground" data-testid="page-title-loads">
          {t("loads.title")}
        </h1>
        <Button
          className="bg-accent hover:bg-accent/90 text-white shadow-sm"
          onClick={() => setAddOpen(true)}
          data-testid="button-add-load"
        >
          <Plus className="h-4 w-4 mr-2" /> {t("loads.addLoad")}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("loads.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border shadow-sm focus:border-primary"
              data-testid="input-search-loads"
            />
          </div>
          <Button
            variant="outline"
            className={`border-border shadow-sm gap-2 ${activeFilters > 0 ? "border-primary text-foreground bg-primary/10" : "text-muted-foreground"}`}
            onClick={() => setFilterOpen((v) => !v)}
            data-testid="button-filter-loads"
          >
            <Filter className="h-4 w-4" />
            {t("common.filters")}
            {activeFilters > 0 && (
              <span className="bg-primary text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
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

      <div className="flex-1 flex flex-col overflow-hidden border border-border bg-card min-h-0 w-full">
        <div className="flex-1 overflow-auto">
          <LoadsSpreadsheet
            loads={loadsData?.data ?? []}
            isLoading={isLoading}
            userRole={userRole}
            brokers={brokersData ?? []}
            drivers={driversData ?? []}
            onAddLoad={() => setAddOpen(true)}
            emptyMessage={{
              title: t("loads.noLoads"),
              subtitle:
                search || activeFilters > 0 ? t("loads.adjustFilters") : t("loads.addFirst"),
              showAdd: !search && !activeFilters,
            }}
          />
        </div>

        {!isLoading && loadsData && loadsData.total > 0 && (
          <div className="px-3 py-2 border-t border-border bg-[#f8f9fa] text-xs text-muted-foreground flex items-center justify-between shrink-0">
            <span>
              {t("loads.showing", { shown: loadsData.data?.length ?? 0, total: loadsData.total })}
            </span>
            {activeFilters > 0 && (
              <button
                className="text-accent hover:underline"
                onClick={() => setFilters({ status: "", driverId: "", brokerId: "" })}
              >
                {t("loads.clearFilters")}
              </button>
            )}
          </div>
        )}
      </div>

      <AddLoadModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
