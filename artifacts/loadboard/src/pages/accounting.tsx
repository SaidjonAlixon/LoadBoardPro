import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useGetAccountingSummary, useListLoads, useListWeeks, listLoads, updateLoad, type LoadUpdate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign, AlertTriangle, TrendingUp, Clock, Check,
  Download, Search, Calendar, X, Eye,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { translateLoadStatus, translateLoadStatusDesc } from "@/lib/i18n/translate";
import { getDashboardKpiParams, formatWeekRangeLabel, normalizeWeekStart, type AccountingDatePreset, type DashboardDateRange } from "@/lib/date-range";
import { exportAccountingExcel, getAccountingExportLabels } from "@/lib/export-accounting-excel";
import { toast } from "sonner";
import { ALL_LOAD_STATUSES, getStatusOptionsForRole } from "@/lib/load-statuses";
import { getSheetStatusClass } from "@/lib/load-status-styles";
import { SheetCellText, SheetEditableCell, SHEET_CELL_CLIP, toCityState } from "@/components/sheet-editable-cell";

const ROUTE_COLS = 4;
const BASE_COL_COUNT = 10;
const DATE_PRESETS: DashboardDateRange[] = ["thisWeek", "lastWeek", "thisMonth"];

function routeCity(city: string, state: string, emDash: string) {
  return city === "-" ? emDash : toCityState(city, state);
}

const HDR =
  "bg-sheet-hdr text-sheet-hdr-fg text-[10px] font-bold uppercase px-2 py-1.5 border-r border-sheet-hdr-border sticky top-0 z-10 text-center align-middle whitespace-nowrap";
const CELL =
  `px-2 py-1 border-r border-b border-sheet-border text-[11px] bg-sheet-cell text-sheet-cell-fg align-middle ${SHEET_CELL_CLIP}`;
const READONLY_CELL = `${CELL} text-muted-foreground bg-sheet-readonly`;
const MONEY_CELL = `${CELL} font-medium tabular-nums`;
const TOTAL_CELL =
  `px-2 py-1 border-r border-b border-sheet-hdr-border text-[11px] bg-sheet-total text-sheet-total-fg font-bold text-center align-middle ${SHEET_CELL_CLIP}`;
const TOTAL_MONEY_CELL =
  "px-2 py-1 border-r border-b border-sheet-hdr-border text-[11px] bg-sheet-total text-sheet-total-fg font-bold text-center align-middle tabular-nums whitespace-nowrap";
const ROW_NUM_CELL = `${CELL} text-muted-foreground bg-sheet-readonly font-medium tabular-nums text-center w-10`;

function SheetStatus({ status }: { status: string }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase ${getSheetStatusClass(status)}`}
      title={translateLoadStatusDesc(t, status)}
    >
      {translateLoadStatus(t, status)}
    </span>
  );
}

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
            <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
            <p className={`text-xl font-bold ${highlight ? "text-red-600" : "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const DATE_RANGE_KEYS: Record<DashboardDateRange, string> = {
  thisWeek: "dashboard.thisWeek",
  lastWeek: "dashboard.lastWeek",
  thisMonth: "dashboard.thisMonth",
};

export default function Accounting() {
  const { t, formatCurrency, formatDate } = useI18n();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("Delivered");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [weekFilter, setWeekFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<AccountingDatePreset>("all");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showRouteDetails, setShowRouteDetails] = useState(false);

  const colCount = BASE_COL_COUNT + (showRouteDetails ? ROUTE_COLS : 0);
  const totalsLabelSpan = showRouteDetails ? 8 : 4;

  const { data: summary, isLoading: summaryLoading } = useGetAccountingSummary({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: loadsData, isLoading: loadsLoading } = useListLoads({
    status: statusFilter === "all" ? undefined : (statusFilter as any),
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    weekStart: weekFilter === "all" ? undefined : weekFilter,
    limit: 200,
  });
  const { data: weeks } = useListWeeks({});

  const loads = loadsData?.data ?? [];

  const statusOptions = useMemo(
    () =>
      getStatusOptionsForRole("accounting").map((s) => ({
        value: s,
        label: translateLoadStatus(t, s),
      })),
    [t],
  );

  const saveChains = useRef(new Map<string, Promise<void>>());
  const invalidateTimer = useRef<ReturnType<typeof setTimeout>>();

  const scheduleRefresh = useCallback(() => {
    clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => {
      void qc.invalidateQueries({ queryKey: ["/api/loads"] });
      void qc.invalidateQueries({ queryKey: ["/api/accounting"] });
    }, 400);
  }, [qc]);

  useEffect(() => () => clearTimeout(invalidateTimer.current), []);

  const patchLoad = useCallback(
    async (id: string, data: LoadUpdate) => {
      const run = async () => {
        await updateLoad(id, data);
        scheduleRefresh();
      };

      const prev = saveChains.current.get(id) ?? Promise.resolve();
      const next = prev
        .then(run)
        .catch(() => {
          toast.error(t("accounting.saveFailed"));
          throw new Error("save failed");
        });

      saveChains.current.set(id, next.catch(() => undefined));
      await next;
    },
    [scheduleRefresh, t],
  );

  const totals = useMemo(() => ({
    rate: loads.reduce((s, l) => s + (l.rate || 0), 0),
    reimb: loads.reduce((s, l) => s + (l.reimbursement || 0), 0),
    invoiced: loads.reduce((s, l) => s + (l.invoicedAmount || 0), 0),
    paid: loads.reduce((s, l) => s + (l.brokerPaid || 0), 0),
    biDiff: loads.reduce((s, l) => s + (l.biDiff ?? 0), 0),
  }), [loads]);

  const formatWeekLabel = useCallback(
    (w: string) => formatWeekRangeLabel(normalizeWeekStart(w), formatDate),
    [formatDate],
  );

  const activeFilters = (dateFrom || dateTo ? 1 : 0) + (weekFilter !== "all" ? 1 : 0);

  const applyPreset = useCallback((preset: AccountingDatePreset) => {
    setDatePreset(preset);
    setWeekFilter("all");
    if (preset === "all") {
      setDateFrom("");
      setDateTo("");
      setDraftFrom("");
      setDraftTo("");
      setDatePopoverOpen(false);
      return;
    }
    if (preset === "custom") return;
    const range = getDashboardKpiParams(preset);
    setDateFrom(range.dateFrom ?? "");
    setDateTo(range.dateTo ?? "");
    setDraftFrom(range.dateFrom ?? "");
    setDraftTo(range.dateTo ?? "");
    setDatePopoverOpen(false);
  }, []);

  const applyCustomDates = useCallback(() => {
    setDateFrom(draftFrom);
    setDateTo(draftTo);
    setDatePreset(draftFrom || draftTo ? "custom" : "all");
    setWeekFilter("all");
    setDatePopoverOpen(false);
  }, [draftFrom, draftTo]);

  const handleWeekChange = useCallback((value: string) => {
    const normalized = value === "all" ? "all" : normalizeWeekStart(value);
    setWeekFilter(normalized);
    if (value !== "all") {
      setDateFrom("");
      setDateTo("");
      setDraftFrom("");
      setDraftTo("");
      setDatePreset("all");
      setDatePopoverOpen(false);
    }
  }, []);

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setDraftFrom("");
    setDraftTo("");
    setWeekFilter("all");
    setDatePreset("all");
  };

  const dateFilterSummary = useMemo(() => {
    if (weekFilter !== "all") return formatWeekLabel(weekFilter);
    if (dateFrom && dateTo) return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;
    if (dateFrom) return `${formatDate(dateFrom)}+`;
    if (dateTo) return `– ${formatDate(dateTo)}`;
    if (datePreset !== "all" && datePreset !== "custom") return t(DATE_RANGE_KEYS[datePreset]);
    return null;
  }, [weekFilter, dateFrom, dateTo, datePreset, formatDate, formatWeekLabel, t]);

  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const page = await listLoads({
        status: statusFilter === "all" ? undefined : (statusFilter as any),
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        weekStart: weekFilter === "all" ? undefined : weekFilter,
        limit: 5000,
      });
      const exportLoads = page.data ?? [];
      if (exportLoads.length === 0) return;
      const labels = getAccountingExportLabels(t, (status) => translateLoadStatus(t, status));
      await exportAccountingExcel(exportLoads, labels);
      toast.success(t("accounting.exportSuccess"));
    } catch {
      toast.error(t("accounting.exportFailed"));
    } finally {
      setExporting(false);
    }
  }, [statusFilter, search, dateFrom, dateTo, weekFilter, t]);

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-foreground">{t("accounting.title")}</h1>
        <div className="flex gap-2 flex-wrap">
          <Popover
            open={datePopoverOpen}
            onOpenChange={(open) => {
              setDatePopoverOpen(open);
              if (open) {
                setDraftFrom(dateFrom);
                setDraftTo(dateTo);
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`gap-1.5 border-border max-w-[240px] ${
                  activeFilters > 0 ? "border-primary text-foreground bg-primary/10" : "text-muted-foreground"
                }`}
              >
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {dateFilterSummary ?? t("accounting.dateFilters")}
                </span>
                {activeFilters > 0 && (
                  <span className="bg-primary text-white text-xs rounded-full min-w-4 h-4 px-1 flex items-center justify-center font-bold shrink-0">
                    {activeFilters}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(100vw-2rem,22rem)] p-0">
              <div className="p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("accounting.dateFilters")}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    variant={datePreset === "all" && weekFilter === "all" && !dateFrom && !dateTo ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => applyPreset("all")}
                  >
                    {t("accounting.datePresetAll")}
                  </Button>
                  {DATE_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant={datePreset === preset ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => applyPreset(preset)}
                    >
                      {t(DATE_RANGE_KEYS[preset])}
                    </Button>
                  ))}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-xs">{t("accounting.fromDate")} / {t("accounting.toDate")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={draftFrom}
                      onChange={(e) => setDraftFrom(e.target.value)}
                      className="border-border h-9 text-xs"
                    />
                    <Input
                      type="date"
                      value={draftTo}
                      onChange={(e) => setDraftTo(e.target.value)}
                      className="border-border h-9 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full h-8"
                    onClick={applyCustomDates}
                    disabled={!draftFrom && !draftTo}
                  >
                    {t("accounting.applyDates")}
                  </Button>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("accounting.week")}</Label>
                  <Select value={weekFilter} onValueChange={handleWeekChange}>
                    <SelectTrigger className="border-border h-9 text-sm">
                      <SelectValue placeholder={t("accounting.allWeeks")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("accounting.allWeeks")}</SelectItem>
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
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-red-500 gap-1 h-8"
                    onClick={clearFilters}
                  >
                    <X className="h-3.5 w-3.5" /> {t("common.clear")}
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-border text-muted-foreground hover:text-foreground"
            onClick={handleExportExcel}
            disabled={exporting || loads.length === 0}
          >
            <Download className="h-4 w-4" />
            {exporting ? t("accounting.exporting") : t("accounting.exportExcel")}
          </Button>
        </div>
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label={t("accounting.totalInvoiced")}
            value={formatCurrency(summary?.totalInvoiced)}
            icon={DollarSign}
            color="bg-primary/10 text-blue-600"
            sub={t("accounting.loadsInvoiced", { count: loads.filter((l) => l.invoicedAmount !== null).length })}
          />
          <KpiCard
            label={t("accounting.brokerPaidWeek")}
            value={formatCurrency(summary?.brokerPaidThisWeek)}
            icon={TrendingUp}
            color="bg-green-50 text-green-600"
            sub={t("accounting.currentWeekPayments")}
          />
          <KpiCard
            label={t("accounting.outstanding")}
            value={formatCurrency(summary?.outstanding)}
            icon={Clock}
            color="bg-orange-50 text-orange-600"
            sub={t("accounting.awaitingPayment", { count: loads.filter((l) => l.invoicedAmount !== null && l.brokerPaid === null).length })}
            highlight={Boolean(summary?.outstanding && summary.outstanding > 0)}
          />
          <KpiCard
            label={t("accounting.underpaymentIssues")}
            value={String(summary?.diffIssues ?? 0)}
            icon={AlertTriangle}
            color="bg-red-50 text-red-600"
            sub={summary?.diffIssues ? t("accounting.actionNeeded") : t("accounting.allClear")}
            highlight={Boolean(summary?.diffIssues && summary.diffIssues > 0)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden border border-border bg-card min-h-0">
        <div className="p-3 border-b border-border flex flex-col sm:flex-row gap-3 shrink-0 bg-muted/20">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("accounting.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44 border-border bg-card h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("accounting.allStatuses")}</SelectItem>
              {ALL_LOAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {translateLoadStatus(t, s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-b border-border bg-muted/30 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-8 text-xs gap-1.5 ${
              showRouteDetails
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                : "border-border text-muted-foreground"
            }`}
            onClick={() => setShowRouteDetails((v) => !v)}
            title={
              showRouteDetails
                ? t("loads.sheet.hideRouteDetails")
                : t("loads.sheet.showRouteDetails")
            }
            data-testid="accounting-full-view"
          >
            <Eye className="h-3.5 w-3.5" />
            {t("loads.sheet.fullView")}
          </Button>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          <table
            className="w-full text-sm border-collapse table-fixed"
            style={{ minWidth: showRouteDetails ? "1400px" : "960px" }}
          >
            <thead>
              <tr>
                <th className={`${HDR} w-10`}>#</th>
                <th className={HDR}>{t("dashboard.loadNumber")}</th>
                <th className={HDR}>{t("dashboard.driver")}</th>
                <th className={HDR}>{t("loads.broker")}</th>
                {showRouteDetails && (
                  <>
                    <th className={HDR}>{t("loads.sheet.puDate")}</th>
                    <th className={HDR}>{t("loads.sheet.origin")}</th>
                    <th className={HDR}>{t("loads.sheet.delDate")}</th>
                    <th className={HDR}>{t("loads.sheet.destination")}</th>
                  </>
                )}
                <th className={HDR}>{t("dashboard.rate")}</th>
                <th className={HDR}>{t("weekly.reimb")}</th>
                <th className={HDR}>{t("accounting.invoicedCol")}</th>
                <th className={HDR}>{t("accounting.paidCol")}</th>
                <th className={HDR}>{t("loads.biDiff")}</th>
                <th className={`${HDR} border-r-0`}>{t("dashboard.status")}</th>
              </tr>
            </thead>
            <tbody>
              {loadsLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: colCount }).map((_, j) => (
                      <td key={j} className={CELL}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : loads.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={`${CELL} border-r-0 py-12 text-center text-muted-foreground`}>
                    {t("accounting.noLoads")}
                  </td>
                </tr>
              ) : (
                loads.map((load, index) => {
                  const biDiff = load.biDiff ?? null;
                  const irDiff = load.irDiff ?? null;
                  const hasIssue = biDiff !== null && biDiff < 0;
                  const isPending = load.invoicedAmount !== null && load.brokerPaid === null;

                  return (
                    <tr
                      key={load.id}
                      className={`${index % 2 === 1 ? "sheet-row-alt" : ""} ${
                        hasIssue ? "bg-red-100/40 dark:bg-red-950/30" : isPending ? "bg-orange-50/50 dark:bg-orange-950/20" : ""
                      }`}
                    >
                      <td className={ROW_NUM_CELL}>{index + 1}</td>
                      <td className={`${CELL} font-bold text-sheet-load-id`}>
                        <SheetCellText>{load.loadNumber}</SheetCellText>
                      </td>
                      <td className={CELL}>
                        <SheetCellText>{load.driver?.fullName || t("common.emDash")}</SheetCellText>
                      </td>
                      <td className={READONLY_CELL}>
                        <SheetCellText>{load.broker?.name || t("common.emDash")}</SheetCellText>
                      </td>
                      {showRouteDetails && (
                        <>
                          <td className={READONLY_CELL}>{formatDate(load.puDate)}</td>
                          <td className={READONLY_CELL}>
                            <SheetCellText>
                              {routeCity(load.originCity, load.originState, t("common.emDash"))}
                            </SheetCellText>
                          </td>
                          <td className={READONLY_CELL}>{formatDate(load.delDate)}</td>
                          <td className={READONLY_CELL}>
                            <SheetCellText>
                              {routeCity(load.destCity, load.destState, t("common.emDash"))}
                            </SheetCellText>
                          </td>
                        </>
                      )}
                      <td className={MONEY_CELL}>{formatCurrency(load.rate)}</td>
                      <td className={READONLY_CELL}>
                        {(load.reimbursement ?? 0) > 0 ? formatCurrency(load.reimbursement) : t("common.emDash")}
                      </td>
                      <SheetEditableCell
                        editable
                        value={String(load.invoicedAmount ?? "")}
                        display={
                          load.invoicedAmount != null ? (
                            <div className="min-w-0">
                              <span>{formatCurrency(load.invoicedAmount)}</span>
                              {irDiff !== null && (
                                <div className={`text-[10px] truncate ${irDiff < 0 ? "text-orange-600" : "text-green-700"}`}>
                                  {t("accounting.irDiff", { amount: `${irDiff >= 0 ? "+" : ""}${formatCurrency(irDiff)}` })}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">{t("accounting.notInvoiced")}</span>
                          )
                        }
                        tooltip={load.invoicedAmount != null ? formatCurrency(load.invoicedAmount) : undefined}
                        inputType="number"
                        className={`${MONEY_CELL} font-medium tabular-nums`}
                        onSave={async (v) =>
                          patchLoad(load.id, { invoicedAmount: v ? Number(v) : null })
                        }
                      />
                      <SheetEditableCell
                        editable
                        value={String(load.brokerPaid ?? "")}
                        display={
                          load.brokerPaid != null ? (
                            <div className="flex items-center justify-center gap-1 min-w-0">
                              {!hasIssue && <Check className="h-3 w-3 text-green-600 shrink-0" />}
                              <span className={hasIssue ? "text-red-600" : "text-green-700"}>
                                {formatCurrency(load.brokerPaid)}
                              </span>
                            </div>
                          ) : (
                            <span className={`text-[10px] font-medium ${isPending ? "text-orange-600" : "text-muted-foreground"}`}>
                              {isPending ? t("accounting.pending") : t("common.emDash")}
                            </span>
                          )
                        }
                        tooltip={load.brokerPaid != null ? formatCurrency(load.brokerPaid) : undefined}
                        inputType="number"
                        className={`${MONEY_CELL} font-medium tabular-nums`}
                        onSave={async (v) =>
                          patchLoad(load.id, { brokerPaid: v ? Number(v) : null })
                        }
                      />
                      <td className={MONEY_CELL}>
                        {biDiff !== null ? (
                          <span className={`inline-flex items-center gap-0.5 ${biDiff < 0 ? "text-red-600" : "text-green-700"}`}>
                            {biDiff < 0 && <AlertTriangle className="h-3 w-3 shrink-0" />}
                            {biDiff >= 0 ? "+" : ""}
                            {formatCurrency(biDiff)}
                          </span>
                        ) : (
                          t("common.emDash")
                        )}
                      </td>
                      <SheetEditableCell
                        editable
                        value={load.status}
                        display={<SheetStatus status={load.status} />}
                        tooltip={translateLoadStatusDesc(t, load.status) ?? translateLoadStatus(t, load.status)}
                        selectOptions={statusOptions}
                        className={`${CELL} border-r-0`}
                        onSave={async (v) =>
                          patchLoad(load.id, { status: v as LoadUpdate["status"] })
                        }
                      />
                    </tr>
                  );
                })
              )}
            </tbody>

            {!loadsLoading && loads.length > 0 && (
              <tfoot>
                <tr className="sheet-totals-row">
                  <td className={TOTAL_CELL} colSpan={totalsLabelSpan}>
                    <SheetCellText>{t("accounting.totals", { count: loads.length })}</SheetCellText>
                  </td>
                  <td className={TOTAL_MONEY_CELL}>{formatCurrency(totals.rate)}</td>
                  <td className={TOTAL_MONEY_CELL}>{formatCurrency(totals.reimb)}</td>
                  <td className={TOTAL_MONEY_CELL}>{formatCurrency(totals.invoiced)}</td>
                  <td className={TOTAL_MONEY_CELL}>{formatCurrency(totals.paid)}</td>
                  <td className={`${TOTAL_MONEY_CELL} ${totals.biDiff < 0 ? "text-red-300" : "text-green-300"}`}>
                    {totals.biDiff >= 0 ? "+" : ""}{formatCurrency(totals.biDiff)}
                  </td>
                  <td className={`${TOTAL_CELL} border-r-0`} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
