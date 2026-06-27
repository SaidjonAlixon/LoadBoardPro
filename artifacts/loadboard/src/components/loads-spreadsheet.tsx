import { Fragment, useCallback, useEffect, useMemo, useRef, useState, startTransition, type ReactNode } from "react";
import type { Broker, Driver, Load, LoadStatus, LoadUpdate, User } from "@workspace/api-client-react";
import { useCreateLoad, useDeleteLoad, useGetKpi, updateLoad } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { LoadsWeekToolbar, type BoardWeek } from "@/components/loads-week-toolbar";
import { LoadsBulkActionBar } from "@/components/loads-bulk-action-bar";
import { LoadsBulkMoveWeekDialog } from "@/components/loads-bulk-move-week-dialog";
import { WeekLockControls } from "@/components/week-lock-controls";
import { WeekLockedOverlay } from "@/components/week-locked-overlay";
import { WeekPermissionRequestDialog } from "@/components/week-permission-request-dialog";
import { WeekPendingRequestsButton } from "@/components/week-pending-requests-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Eye,
  Trash2,
  Columns2,
  GripVertical,
  DollarSign,
  Route,
  TrendingUp,
  Divide,
  AlertTriangle,
  Check,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useI18n } from "@/lib/i18n";
import { translateLoadStatus, translateLoadStatusDesc } from "@/lib/i18n/translate";
import { getStatusOptionsForRole, isLoadDispatcherLocked } from "@/lib/load-statuses";
import { getSheetStatusClass } from "@/lib/load-status-styles";
import {
  SheetEditableCell,
  SheetCellText,
  SheetCopyableCell,
  SheetDispatcherCell,
  SHEET_CELL_CLIP,
  isoToSheetDate,
  parseCityState,
  formatLocationForEdit,
} from "@/components/sheet-editable-cell";
import {
  computeAutoFitWidths,
  filterVisibleWidths,
  getDefaultSheetWidths,
  scaleWidthsToContainer,
  SELECT_COL_INDEX,
} from "@/components/sheet-column-widths";
import { spreadsheetLoadHeaders } from "@/lib/load-board-scope";
import { resolveBrokerIdByName } from "@/lib/resolve-broker";
import { cn } from "@/lib/utils";
import { getMondayOfWeek, getThisWeekStart, normalizeWeekStart, toIsoDateLocal, weekEndFromStart, addDays, formatWeekRangeLabel } from "@/lib/date-range";
import {
  DISPATCHER_REQUIRED_FIELD_LABEL_KEYS,
  getActiveDraftLoadId,
  getDispatcherFieldValidation,
  getDispatcherLoadMissingFields,
  getNextRequiredDraftField,
  isDraftDateUnset,
  isDraftDispatcherUnset,
  getPrimaryPatchField,
  isDraftLoadNumber,
  isLoadDraftInProgress,
  isPlaceholderCity,
  markDraftFieldTouched,
  shouldValidateDispatcherPatch,
  validateDispatcherPatchValue,
  type SheetValidationField,
} from "@/lib/validate-dispatcher-load";
import { toast } from "sonner";

const COL_COUNT_BASE = 17;
const COL_COUNT_FINANCIAL = 4;
const COL_COUNT = COL_COUNT_BASE + COL_COUNT_FINANCIAL;

const DISPATCHER_FIELDS = new Set([
  "loadNumber", "brokerId",
  "puDate", "delDate", "originCity", "originState", "destCity", "destState",
  "mileage", "rate", "reimbursement", "dispatchNotes", "status",
]);

const ACCOUNTING_FIELDS = new Set(["invoicedAmount", "brokerPaid", "status"]);

type TotalsColumn =
  | "hash"
  | "type"
  | "driver"
  | "broker"
  | "loadNum"
  | "puDate"
  | "origin"
  | "delDate"
  | "dest"
  | "mileage"
  | "rpm"
  | "rate"
  | "dispatcher"
  | "reimb"
  | "notes"
  | "status"
  | "select"
  | "invoiced"
  | "irDiff"
  | "brokerPaid"
  | "biDiff";

function buildTotalsColumns(
  showRouteDetails: boolean,
  showFinancial: boolean,
  showActionColumn: boolean,
): TotalsColumn[] {
  const cols: TotalsColumn[] = [];
  if (showActionColumn) cols.push("select");
  cols.push("hash", "type", "driver", "broker", "loadNum");
  if (showRouteDetails) cols.push("puDate", "origin", "delDate", "dest");
  cols.push("mileage", "rpm", "rate", "dispatcher", "reimb", "notes", "status");
  if (showFinancial) cols.push("invoiced", "irDiff", "brokerPaid", "biDiff");
  return cols;
}

const SHEET_ROW_COMPACT = "px-1.5 py-1 min-h-[32px] text-[10px] leading-tight";
const SHEET_ROW_WIDE = "px-2.5 py-1.5 min-h-[36px] text-xs leading-tight";

const HDR_BASE =
  "relative bg-sheet-hdr text-sheet-hdr-fg font-bold uppercase tracking-wide border-r border-sheet-hdr-border sticky top-0 z-30 text-center align-middle whitespace-nowrap antialiased shadow-[0_1px_0_hsl(var(--sheet-hdr-border))]";
const CELL =
  `px-1.5 py-0.5 border-r border-b border-sheet-border text-[11px] bg-sheet-cell text-sheet-cell-fg text-center align-middle ${SHEET_CELL_CLIP}`;
const GROUP_CELL =
  "px-1.5 py-0.5 border-r border-b border-sheet-border text-[11px] bg-sheet-group text-sheet-cell-fg text-center align-middle";
const TOTAL_BASE =
  "border-r border-b border-sheet-total-border bg-sheet-total text-sheet-total-fg text-center align-middle tracking-wide antialiased box-border overflow-hidden";
const READONLY_CELL = `${CELL} text-muted-foreground bg-sheet-readonly`;
const ROW_NUM_CELL = `${CELL} text-muted-foreground bg-sheet-readonly font-medium tabular-nums`;

function readPatchError(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { error?: string } }).data;
    if (data?.error) return data.error;
  }
  if (err instanceof Error && err.message && err.message !== "validation") {
    return err.message;
  }
  return null;
}

function canEditField(
  role: string,
  field: string,
  load?: Load,
  activeDraftLoadId?: string | null,
  currentUserId?: string | null,
  weekEditable = true,
): boolean {
  if (role === "dispatcher" && !weekEditable) return false;
  if (load && activeDraftLoadId && load.id !== activeDraftLoadId) {
    if (role !== "accounting" && role !== "admin" && role !== "dispatcher") return false;
  }
  if (field === "dispatcherId") {
    if (load && isLoadDispatcherLocked(load.status) && role !== "accounting" && role !== "admin") {
      return false;
    }
    if (role === "admin" || role === "accounting" || role === "dispatcher") {
      return !!currentUserId;
    }
    return false;
  }
  if (load && role === "dispatcher") {
    if (isLoadDispatcherLocked(load.status)) return false;
  }
  if (["rpm", "irDiff", "biDiff", "type", "driver"].includes(field)) return false;
  if (role === "accounting") {
    return (
      DISPATCHER_FIELDS.has(field)
      || ACCOUNTING_FIELDS.has(field)
      || field === "dispatcherId"
      || field === "driverId"
    );
  }
  if (role === "dispatcher") return DISPATCHER_FIELDS.has(field);
  if (role === "admin") {
    return ACCOUNTING_FIELDS.has(field) || DISPATCHER_FIELDS.has(field) || field === "driverId" || field === "dispatcherId";
  }
  return false;
}

function canDeleteLoadRow(
  role: string,
  load: Load,
  currentUserId?: string | null,
  weekEditable = true,
): boolean {
  if (role === "accounting" || role === "admin") return true;
  if (role === "dispatcher" && !weekEditable) return false;
  if (isLoadDispatcherLocked(load.status)) return false;
  if (role === "dispatcher") {
    return !!currentUserId;
  }
  return false;
}

function canDragReorderLoad(role: string, load: Load): boolean {
  if (role === "accounting" || role === "admin") return true;
  return !isLoadDispatcherLocked(load.status);
}

function ownsLoad(role: string, _load: Load, currentUserId?: string | null): boolean {
  if (role === "admin" || role === "accounting") return true;
  if (role === "dispatcher") return !!currentUserId;
  return false;
}

function canSelectLoad(
  role: string,
  load: Load,
  currentUserId?: string | null,
  activeDraftLoadId?: string | null,
): boolean {
  if (activeDraftLoadId && load.id !== activeDraftLoadId) {
    if (role !== "accounting" && role !== "admin" && role !== "dispatcher") return false;
  }
  return ownsLoad(role, load, currentUserId);
}

function isSheetFieldTouched(field: SheetValidationField, touched?: Set<string>): boolean {
  if (!touched?.size) return false;
  if (field === "origin") return touched.has("origin");
  if (field === "dest") return touched.has("dest");
  if (field === "broker") return touched.has("brokerId");
  return touched.has(field);
}

function cellValidation(
  load: Load,
  field: SheetValidationField,
  activeDraftLoadId: string | null,
  touched?: Set<string>,
  requireDispatcher = false,
): "valid" | "invalid" | "neutral" {
  if (!activeDraftLoadId || load.id !== activeDraftLoadId) return "neutral";
  if (!isSheetFieldTouched(field, touched)) return "neutral";
  return getDispatcherFieldValidation(load, field, touched, { requireDispatcher });
}

function formatSheetDate(date: string): string {
  return isoToSheetDate(date);
}

function driverTypeShort(type?: string): string {
  if (type === "CD") return "C/D";
  if (type === "OO") return "O/O";
  if (type === "Lease") return "Lease";
  return "—";
}

function driverTypeBadgeClass(type?: string): string {
  const base =
    "inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border shadow-sm backdrop-blur-[2px]";
  if (type === "OO") {
    return `${base} bg-primary/12 text-primary border-primary/25 dark:bg-sky-500/20 dark:text-sky-200 dark:border-sky-400/35`;
  }
  if (type === "CD") {
    return `${base} bg-success/12 text-success border-success/25 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-400/35`;
  }
  if (type === "Lease") {
    return `${base} bg-accent/12 text-accent border-accent/25 dark:bg-accent/20 dark:text-accent dark:border-accent/40`;
  }
  return `${base} bg-muted/50 text-muted-foreground border-border/45 font-medium normal-case tracking-normal dark:bg-muted/30 dark:text-muted-foreground dark:border-border/50`;
}

function normalizeDriverId(driverId: string | null | undefined): string | null {
  return driverId ?? null;
}

function isNewLoad(load: Load): boolean {
  return isDraftLoadNumber(load.loadNumber);
}

function loadsInWeek(loads: Load[], weekStart: string): Load[] {
  const mon = normalizeWeekStart(weekStart);
  return loads.filter((l) => normalizeWeekStart(l.weekStart || l.puDate) === mon);
}

function sortLoadsByOrder(loads: Load[]): Load[] {
  return [...loads].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
}

function nextSortOrderForDriverGroup(
  allLoads: Load[],
  driverId: string | null,
  weekStart: string,
): number {
  const mon = normalizeWeekStart(weekStart);
  let max = -1;
  for (const load of allLoads) {
    if ((load.driverId ?? null) !== driverId) continue;
    if (normalizeWeekStart(load.weekStart || load.puDate) !== mon) continue;
    max = Math.max(max, load.sortOrder ?? 0);
  }
  return max + 1;
}

function driverCreatedTime(driver: Load["driver"] | Driver | null | undefined): number {
  if (!driver?.createdAt) return Number.MAX_SAFE_INTEGER;
  return new Date(driver.createdAt).getTime();
}

function groupFirstLoadTime(loads: Load[]): number {
  if (loads.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(
    ...loads.map((l) => {
      if (l.createdAt) return new Date(l.createdAt).getTime();
      return (l.sortOrder ?? 0) * 1000;
    }),
  );
}

function sortDriverGroups(
  groups: { driver: Load["driver"]; driverId: string | null; loads: Load[] }[],
) {
  return [...groups].sort((a, b) => {
    const aHasLoads = a.loads.length > 0;
    const bHasLoads = b.loads.length > 0;
    if (aHasLoads !== bHasLoads) return aHasLoads ? -1 : 1;
    if (aHasLoads) return groupFirstLoadTime(a.loads) - groupFirstLoadTime(b.loads);
    return driverCreatedTime(a.driver) - driverCreatedTime(b.driver);
  });
}

function groupLoadsByDriver(
  loads: Load[],
  drivers: Driver[],
  options?: { compactGroups?: boolean; filterDriverId?: string },
) {
  const map = new Map<string, { driver: Load["driver"]; driverId: string | null; loads: Load[] }>();
  for (const load of loads) {
    const key = load.driverId ?? "__unassigned__";
    if (!map.has(key)) {
      map.set(key, { driver: load.driver ?? undefined, driverId: load.driverId ?? null, loads: [] });
    }
    map.get(key)!.loads.push(load);
  }

  if (!options?.compactGroups) {
    const activeDrivers = [...drivers.filter((x) => x.isActive)].sort(
      (a, b) => driverCreatedTime(a) - driverCreatedTime(b),
    );
    for (const d of activeDrivers) {
      if (!map.has(d.id)) {
        map.set(d.id, {
          driver: d,
          driverId: d.id,
          loads: [],
        });
      }
    }
  } else if (options.filterDriverId) {
    const d = drivers.find((x) => x.id === options.filterDriverId);
    if (d && !map.has(d.id)) {
      map.set(d.id, {
        driver: d,
        driverId: d.id,
        loads: [],
      });
    }
  }

  return sortDriverGroups(
    Array.from(map.values()).map((group) => ({
      ...group,
      loads: sortLoadsByOrder(group.loads),
    })),
  );
}

function sumField(loads: Load[], field: keyof Load): number {
  return loads.reduce((acc, l) => acc + (Number(l[field]) || 0), 0);
}

function SheetStatus({ status }: { status: LoadStatus | string }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center justify-center max-w-full px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border shadow-sm backdrop-blur-[2px] ${getSheetStatusClass(status)}`}
      title={translateLoadStatusDesc(t, status)}
    >
      {translateLoadStatus(t, status)}
    </span>
  );
}

function ReadOnlyMoneyCell({
  value,
  formatCurrency,
  highlightNegative,
  className = "",
}: {
  value: number | null | undefined;
  formatCurrency: (n: number) => string;
  highlightNegative?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  if (value === null || value === undefined) {
    return (
      <SheetCopyableCell value="" className={`${READONLY_CELL} ${className}`}>
        {t("common.emDash")}
      </SheetCopyableCell>
    );
  }
  const neg = highlightNegative && value < 0;
  const text = formatCurrency(value);
  return (
    <SheetCopyableCell
      value={text}
      className={`${READONLY_CELL} font-medium ${neg ? "bg-red-200 text-red-900" : ""} ${className}`}
      title={text}
    >
      <SheetCellText>{text}</SheetCellText>
    </SheetCopyableCell>
  );
}

function recomputeLoadDerivedFields(load: Load): Load {
  const rate = Number(load.rate) || 0;
  const reimb = Number(load.reimbursement) || 0;
  const mileage = Number(load.mileage) || 0;
  const invoiced = load.invoicedAmount;
  const paid = load.brokerPaid;
  const rpm = mileage > 0 ? rate / mileage : null;
  const irDiff = invoiced != null ? invoiced - (rate + reimb) : null;
  const biDiff = paid != null && invoiced != null ? paid - invoiced : null;
  return { ...load, rpm, irDiff, biDiff };
}

function patchLoadInCache(
  qc: ReturnType<typeof useQueryClient>,
  loadId: string,
  patch: LoadUpdate | Load,
  dispatchers: User[],
): void {
  qc.setQueriesData<{ data: Load[] }>({ queryKey: ["/api/loads"] }, (old) => {
    if (!old?.data) return old;
    return {
      ...old,
      data: old.data.map((l) => {
        if (l.id !== loadId) return l;
        const next: Load = recomputeLoadDerivedFields({ ...l, ...patch });
        if ("dispatcherId" in patch && patch.dispatcherId) {
          const d = dispatchers.find((x) => x.id === patch.dispatcherId);
          if (d) next.dispatcher = d;
        }
        return next;
      }),
    };
  });
}

function isPendingLoadId(id: string): boolean {
  return id.startsWith("pending-");
}

function appendLoadToCache(qc: ReturnType<typeof useQueryClient>, load: Load): void {
  qc.setQueriesData<{ data: Load[] }>({ queryKey: ["/api/loads"] }, (old) => {
    const data = old?.data ?? [];
    if (data.some((l) => l.id === load.id)) return old ?? { data };
    return { ...old, data: [...data, load] };
  });
}

function removeLoadFromCache(qc: ReturnType<typeof useQueryClient>, loadId: string): void {
  qc.setQueriesData<{ data: Load[] }>({ queryKey: ["/api/loads"] }, (old) => {
    if (!old?.data) return old;
    return { ...old, data: old.data.filter((l) => l.id !== loadId) };
  });
}

function replaceLoadInCache(
  qc: ReturnType<typeof useQueryClient>,
  tempId: string,
  realLoad: Load,
  dispatchers: User[],
): void {
  qc.setQueriesData<{ data: Load[] }>({ queryKey: ["/api/loads"] }, (old) => {
    if (!old?.data) return old;
    return {
      ...old,
      data: old.data.map((l) => {
        if (l.id !== tempId) return l;
        const next = recomputeLoadDerivedFields({ ...realLoad });
        if (realLoad.dispatcherId) {
          const d = dispatchers.find((x) => x.id === realLoad.dispatcherId);
          if (d) next.dispatcher = d;
        }
        return next;
      }),
    };
  });
}

function accountingFinancialFlags(load: Load) {
  const biDiff = load.biDiff ?? null;
  const irDiff = load.irDiff ?? null;
  return {
    biDiff,
    irDiff,
    hasIssue: biDiff !== null && biDiff < 0,
    isPending: load.invoicedAmount !== null && load.brokerPaid === null,
  };
}

function SheetToolbarStat({
  label,
  value,
  icon: Icon,
  iconWrapClass,
  labelClass,
  layout = "card",
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  iconWrapClass: string;
  labelClass: string;
  layout?: "card" | "compact" | "fill";
}) {
  if (layout === "compact") {
    return (
      <div
        className="flex h-9 min-w-[5.5rem] max-w-[7rem] shrink-0 flex-col justify-center rounded-md border border-border/60 bg-card/80 px-2 py-1 shadow-sm"
        title={`${label}: ${value}`}
      >
        <span className={`truncate text-[9px] font-bold uppercase leading-tight tracking-wide ${labelClass}`}>
          {label}
        </span>
        <span className="truncate text-xs font-bold tabular-nums leading-tight text-foreground">
          {value}
        </span>
      </div>
    );
  }

  const fill = layout === "fill";

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-border/60 bg-card/90 shadow-sm ${
        fill
          ? "min-w-0 w-full px-2 py-2 sm:gap-2.5 sm:px-2.5"
          : "min-w-[8.5rem] max-w-[11rem] flex-1 gap-2.5 px-3 py-2"
      }`}
      title={`${label}: ${value}`}
    >
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg ${iconWrapClass} ${
          fill ? "h-8 w-8" : "h-9 w-9"
        }`}
      >
        <Icon className={fill ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          className={`truncate font-semibold uppercase tracking-wide ${labelClass} ${
            fill ? "text-[9px] leading-tight sm:text-[10px]" : "text-[10px]"
          }`}
        >
          {label}
        </div>
        <div
          className={`truncate font-bold tabular-nums text-foreground ${
            fill ? "text-[11px] leading-tight sm:text-xs md:text-sm" : "text-sm"
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

interface LoadsSpreadsheetProps {
  loads: Load[];
  isLoading: boolean;
  userRole: string;
  currentUserId?: string | null;
  brokers?: Broker[];
  drivers?: Driver[];
  weekStart?: string;
  boardWeeks?: BoardWeek[];
  onWeekChange?: (weekStart: string) => void;
  onCreateWeek?: () => void;
  creatingWeek?: boolean;
  onAddLoad?: () => void;
  emptyMessage?: { title: string; subtitle: string; showAdd?: boolean };
  /** When filters/search are active, hide empty driver rows except the selected driver. */
  compactDriverGroups?: boolean;
  searchQuery?: string;
  filterDriverId?: string;
  dispatcherFilterId?: string;
  dispatchers?: User[];
  toolbarLeading?: ReactNode;
  toolbarFilterPanel?: ReactNode;
}

export function LoadsSpreadsheet({
  loads,
  isLoading,
  userRole,
  currentUserId = null,
  brokers = [],
  drivers = [],
  weekStart: weekStartProp,
  boardWeeks = [],
  onWeekChange,
  onCreateWeek,
  creatingWeek = false,
  onAddLoad,
  emptyMessage,
  compactDriverGroups = false,
  searchQuery = "",
  filterDriverId,
  dispatcherFilterId,
  dispatchers = [],
  toolbarLeading,
  toolbarFilterPanel,
}: LoadsSpreadsheetProps) {
  const weekStart = weekStartProp ?? getThisWeekStart();
  const kpiParams = useMemo(() => {
    const mon = normalizeWeekStart(weekStart);
    return {
      weekStart: mon,
      dateFrom: mon,
      dateTo: weekEndFromStart(mon),
      ...(dispatcherFilterId ? { dispatcherId: dispatcherFilterId } : {}),
      ...(filterDriverId ? { driverId: filterDriverId } : {}),
    };
  }, [weekStart, dispatcherFilterId, filterDriverId]);
  const { data: kpi, isLoading: kpiLoading } = useGetKpi(kpiParams);
  const { t, formatCurrency, formatNumber, formatDate } = useI18n();
  const qc = useQueryClient();
  const monWeek = normalizeWeekStart(weekStart);

  const { data: weekAccess, refetch: refetchWeekAccess } = useQuery<{
    isLocked: boolean;
    canEdit: boolean;
    grantExpiresAt: string | null;
    scheduledLockAt: string | null;
  }>({
    queryKey: ["/api/week-locks/access", monWeek],
    queryFn: async () => {
      const res = await fetch(
        `/api/week-locks/access?weekStart=${encodeURIComponent(monWeek)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load week access");
      return res.json();
    },
  });

  const { data: lockSettings, refetch: refetchLockSettings } = useQuery<{
    autoLockOnWeekRollover: boolean;
  }>({
    queryKey: ["/api/week-locks/settings"],
    enabled: userRole === "accounting" || userRole === "admin",
    queryFn: async () => {
      const res = await fetch("/api/week-locks/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const weekEditableForDispatcher =
    userRole !== "dispatcher" || (weekAccess?.canEdit ?? true);
  const showWeekLockOverlay =
    userRole === "dispatcher" && !!weekAccess?.isLocked && !weekAccess?.canEdit;
  const showGrantBanner =
    userRole === "dispatcher"
    && !!weekAccess?.isLocked
    && !!weekAccess?.canEdit
    && !!weekAccess?.grantExpiresAt;
  const currentWeekLockMeta = useMemo(
    () => boardWeeks.find((w) => normalizeWeekStart(w.weekStart) === monWeek),
    [boardWeeks, monWeek],
  );
  const [requestPermissionOpen, setRequestPermissionOpen] = useState(false);

  const invalidateWeekLock = useCallback(() => {
    void refetchWeekAccess();
    void refetchLockSettings();
    void qc.invalidateQueries({ queryKey: ["/api/board-weeks"] });
  }, [qc, refetchLockSettings, refetchWeekAccess]);

  const weekEditable = weekEditableForDispatcher;
  const weekDefaultMonth = useMemo(
    () => new Date(`${monWeek}T12:00:00`),
    [monWeek],
  );
  const hiddenStorageKey = `lb_hidden_drivers_${weekStart}`;

  const readHiddenDrivers = useCallback((key: string) => {
    try {
      const raw = sessionStorage.getItem(key);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  }, []);

  const [hiddenDriverIds, setHiddenDriverIds] = useState<Set<string>>(() =>
    readHiddenDrivers(`lb_hidden_drivers_${weekStartProp ?? getThisWeekStart()}`),
  );

  useEffect(() => {
    setHiddenDriverIds(readHiddenDrivers(hiddenStorageKey));
  }, [hiddenStorageKey, readHiddenDrivers]);

  const persistHiddenDrivers = useCallback(
    (ids: Set<string>) => {
      try {
        sessionStorage.setItem(hiddenStorageKey, JSON.stringify([...ids]));
      } catch {
        /* ignore */
      }
    },
    [hiddenStorageKey],
  );
  const groups = useMemo(
    () =>
      groupLoadsByDriver(loads, drivers, {
        compactGroups: compactDriverGroups,
        filterDriverId,
      }).filter((g) => {
        if (searchQuery.trim() && g.loads.length > 0) return true;
        return !g.driverId || !hiddenDriverIds.has(g.driverId);
      }),
    [loads, drivers, hiddenDriverIds, compactDriverGroups, filterDriverId, searchQuery],
  );
  const rowNumberByLoadId = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const group of groups) {
      for (const load of group.loads) {
        n += 1;
        map.set(load.id, n);
      }
    }
    return map;
  }, [groups]);

  const weekLoadsAll = useMemo(() => loadsInWeek(loads, weekStart), [loads, weekStart]);
  const weekLoadsAllComplete = useMemo(
    () => weekLoadsAll.filter((l) => !isLoadDraftInProgress(l)),
    [weekLoadsAll],
  );
  const fullViewFinancialTotals = useMemo(() => {
    const totalReimb = sumField(weekLoadsAllComplete, "reimbursement");
    const totalRate = sumField(weekLoadsAllComplete, "rate");
    const totalInvoiced = weekLoadsAllComplete.reduce((a, l) => a + (l.invoicedAmount ?? 0), 0);
    const totalPaid = weekLoadsAllComplete.reduce((a, l) => a + (l.brokerPaid ?? 0), 0);
    const totalIr = totalInvoiced - (totalRate + totalReimb);
    const totalBi = totalPaid - totalInvoiced;
    return { totalReimb, totalRate, totalInvoiced, totalPaid, totalIr, totalBi };
  }, [weekLoadsAllComplete]);

  const canAddLoad = (userRole === "dispatcher" || userRole === "admin") && weekEditable;
  const canReorder =
    userRole === "accounting" || ((userRole === "dispatcher" || userRole === "admin") && weekEditable);
  const requireDispatcher = true;
  const [draftTouchedFields, setDraftTouchedFields] = useState<Map<string, Set<string>>>(new Map());
  const activeDraftLoadId = useMemo(
    () => getActiveDraftLoadId(loads, draftTouchedFields, { requireDispatcher }),
    [loads, draftTouchedFields, requireDispatcher],
  );
  const canReorderRows = canReorder && !activeDraftLoadId;
  const [draggingLoadId, setDraggingLoadId] = useState<string | null>(null);
  const [dragDriverId, setDragDriverId] = useState<string | null | undefined>(undefined);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const canToggleFinancial = userRole !== "accounting";
  const canToggleRouteDetails = userRole === "accounting";
  const showActionColumn =
    userRole === "dispatcher" || userRole === "admin" || userRole === "accounting";
  const canBulkDelete =
    userRole === "accounting" ||
    ((userRole === "dispatcher" || userRole === "admin") && weekEditable);
  const canBulkMoveWeek = userRole === "accounting";
  const [selectedLoadIds, setSelectedLoadIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [moveWeekOpen, setMoveWeekOpen] = useState(false);
  const [showFinancial, setShowFinancial] = useState(userRole === "accounting");
  const [showRouteDetails, setShowRouteDetails] = useState(userRole !== "accounting");
  const [focusCell, setFocusCell] = useState<{ loadId: string; field: string } | null>(null);
  const [creatingRow, setCreatingRow] = useState(false);
  const creatingRowRef = useRef(false);
  const pendingCreatePatchesRef = useRef(new Map<string, LoadUpdate[]>());
  const pendingApiPatchesRef = useRef(new Map<string, LoadUpdate>());
  const patchFlushTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const patchInflightRef = useRef(new Map<string, Promise<void>>());
  const focusCellRef = useRef(focusCell);
  focusCellRef.current = focusCell;
  const addRowBlocked = !!activeDraftLoadId || creatingRow;
  const [columnWidths, setColumnWidths] = useState<number[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    setShowFinancial(userRole === "accounting");
    setShowRouteDetails(userRole !== "accounting");
  }, [userRole]);

  useEffect(() => {
    setSelectedLoadIds(new Set());
  }, [weekStart]);

  useEffect(() => {
    if (!focusCell) return;
    requestAnimationFrame(() => {
      const row = containerRef.current?.querySelector(
        `[data-testid="row-load-${focusCell.loadId}"]`,
      );
      row?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }, [focusCell?.loadId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const compactRoute = canToggleRouteDetails && !showRouteDetails;
  const wide = (canToggleFinancial && !showFinancial) || compactRoute;
  const isFullView = canToggleRouteDetails ? showRouteDetails : showFinancial;

  const showExtendedToolbarStats =
    weekLoadsAll.length > 0 &&
    (userRole === "accounting" || userRole === "admin" || userRole === "dispatcher");

  const toolbarStats = useMemo(() => {
    if ((kpi?.totalLoads ?? 0) === 0) return [];
    const stats: Array<{
      label: string;
      value: string;
      icon: typeof DollarSign;
      iconWrapClass: string;
      labelClass: string;
    }> = [
      {
        label: t("dashboard.totalGross"),
        value: formatCurrency(kpi?.totalGross ?? 0),
        icon: DollarSign,
        iconWrapClass: "bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300",
        labelClass: "text-sky-700 dark:text-sky-300",
      },
      {
        label: t("dashboard.totalMiles"),
        value: formatNumber(kpi?.totalMiles ?? 0),
        icon: Route,
        iconWrapClass: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300",
        labelClass: "text-violet-700 dark:text-violet-300",
      },
      {
        label: t("dashboard.avgRpm"),
        value: formatCurrency(kpi?.avgRpm ?? 0),
        icon: TrendingUp,
        iconWrapClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
        labelClass: "text-emerald-700 dark:text-emerald-300",
      },
      {
        label: t("dashboard.grossPerDriver"),
        value: formatCurrency(kpi?.grossPerDriver ?? 0),
        icon: Divide,
        iconWrapClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
        labelClass: "text-amber-800 dark:text-amber-300",
      },
    ];
    if (showExtendedToolbarStats) {
      stats.push(
        {
          label: t("loads.sheet.reimbursement"),
          value: fullViewFinancialTotals.totalReimb
            ? formatCurrency(fullViewFinancialTotals.totalReimb)
            : t("common.emDash"),
          icon: DollarSign,
          iconWrapClass: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
          labelClass: "text-orange-800 dark:text-orange-300",
        },
        {
          label: t("loads.sheet.invoicedAmount"),
          value: formatCurrency(fullViewFinancialTotals.totalInvoiced),
          icon: DollarSign,
          iconWrapClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
          labelClass: "text-cyan-800 dark:text-cyan-300",
        },
        {
          label: t("loads.sheet.brokerPaid"),
          value: formatCurrency(fullViewFinancialTotals.totalPaid),
          icon: DollarSign,
          iconWrapClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
          labelClass: "text-indigo-800 dark:text-indigo-300",
        },
      );
      if (showFinancial) {
        const { totalIr, totalBi } = fullViewFinancialTotals;
        stats.push(
          {
            label: t("loads.sheet.irDiff"),
            value: `${totalIr >= 0 ? "+" : ""}${formatCurrency(totalIr)}`,
            icon: TrendingUp,
            iconWrapClass:
              totalIr < 0
                ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
                : "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-300",
            labelClass:
              totalIr < 0
                ? "text-orange-800 dark:text-orange-300"
                : "text-green-800 dark:text-green-300",
          },
          {
            label: t("loads.sheet.biDiff"),
            value: `${totalBi >= 0 ? "+" : ""}${formatCurrency(totalBi)}`,
            icon: AlertTriangle,
            iconWrapClass:
              totalBi < 0
                ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                : "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-300",
            labelClass:
              totalBi < 0
                ? "text-red-800 dark:text-red-300"
                : "text-green-800 dark:text-green-300",
          },
        );
      }
    }
    return stats;
  }, [
    kpi?.totalGross,
    kpi?.totalLoads,
    kpi?.totalMiles,
    kpi?.avgRpm,
    kpi?.grossPerDriver,
    showExtendedToolbarStats,
    showFinancial,
    fullViewFinancialTotals,
    formatCurrency,
    formatNumber,
    t,
  ]);

  const rawWidths = columnWidths ?? getDefaultSheetWidths(wide, showFinancial);
  const baseEffectiveWidths = filterVisibleWidths(rawWidths, {
    showRouteDetails,
    showActionColumn,
  });
  const effectiveWidths = useMemo(() => {
    if (columnWidths !== null || containerWidth <= 0) return baseEffectiveWidths;
    const financialColCount = showFinancial ? COL_COUNT_FINANCIAL : 0;
    return scaleWidthsToContainer(baseEffectiveWidths, containerWidth, financialColCount);
  }, [baseEffectiveWidths, containerWidth, columnWidths, showFinancial]);
  const tableMinWidth = useMemo(() => {
    const sum = effectiveWidths.reduce((a, b) => a + b, 0);
    if (columnWidths !== null) return Math.max(sum, containerWidth);
    return containerWidth > 0 ? containerWidth : sum;
  }, [effectiveWidths, containerWidth, columnWidths]);

  useEffect(() => {
    setColumnWidths(null);
  }, [wide, showFinancial, showRouteDetails]);
  const sheetRowPad = wide ? SHEET_ROW_WIDE : SHEET_ROW_COMPACT;
  const hdrCls = `${HDR_BASE} ${sheetRowPad}`;
  const cellCls = wide ? `${CELL} px-2.5 py-1.5 text-xs` : CELL;
  const groupCls = wide ? `${GROUP_CELL} px-2.5 py-1.5 text-xs` : GROUP_CELL;
  const readonlyCls = wide ? `${READONLY_CELL} px-2.5 py-1.5 text-xs` : READONLY_CELL;
  const totalCellCls = `${TOTAL_BASE} ${sheetRowPad}`;
  const totalMoneyCls = `${TOTAL_BASE} font-bold tabular-nums whitespace-nowrap ${sheetRowPad}`;
  const totalLabelCls = `${TOTAL_BASE} font-bold uppercase whitespace-nowrap ${sheetRowPad}`;
  const visibleColCount = buildTotalsColumns(
    showRouteDetails,
    showFinancial,
    showActionColumn,
  ).length;

  const selectableLoadIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      for (const load of loadsInWeek(group.loads, weekStart)) {
        if (canSelectLoad(userRole, load, currentUserId, activeDraftLoadId)) {
          ids.push(load.id);
        }
      }
    }
    return ids;
  }, [groups, weekStart, userRole, currentUserId, activeDraftLoadId]);

  const allLoadsSelected =
    selectableLoadIds.length > 0 && selectableLoadIds.every((id) => selectedLoadIds.has(id));
  const someLoadsSelected = selectableLoadIds.some((id) => selectedLoadIds.has(id));

  const toggleSelectLoad = useCallback((loadId: string) => {
    setSelectedLoadIds((prev) => {
      const next = new Set(prev);
      if (next.has(loadId)) next.delete(loadId);
      else next.add(loadId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allLoadsSelected) {
      setSelectedLoadIds(new Set());
      return;
    }
    setSelectedLoadIds(new Set(selectableLoadIds));
  }, [allLoadsSelected, selectableLoadIds]);

  const toggleSelectGroup = useCallback(
    (groupLoads: Load[]) => {
      const ids = groupLoads
        .filter((l) => canSelectLoad(userRole, l, currentUserId, activeDraftLoadId))
        .map((l) => l.id);
      if (!ids.length) return;
      const allInGroup = ids.every((id) => selectedLoadIds.has(id));
      setSelectedLoadIds((prev) => {
        const next = new Set(prev);
        if (allInGroup) ids.forEach((id) => next.delete(id));
        else ids.forEach((id) => next.add(id));
        return next;
      });
    },
    [userRole, currentUserId, activeDraftLoadId, selectedLoadIds],
  );

  const clearSelection = useCallback(() => setSelectedLoadIds(new Set()), []);

  const toggleFullView = useCallback(() => {
    if (canToggleRouteDetails) setShowRouteDetails((v) => !v);
    else setShowFinancial((v) => !v);
  }, [canToggleRouteDetails]);

  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftTouchedRef = useRef(draftTouchedFields);
  draftTouchedRef.current = draftTouchedFields;

  const findLoadInCache = useCallback(
    (loadId: string): Load | undefined => {
      const entries = qc.getQueriesData<{ data?: Load[] }>({ queryKey: ["/api/loads"] });
      for (const [, page] of entries) {
        const hit = page?.data?.find((l) => l.id === loadId);
        if (hit) return hit;
      }
      return loads.find((l) => l.id === loadId);
    },
    [qc, loads],
  );

  const applyOptimisticLoadPatch = useCallback(
    (loadId: string, data: LoadUpdate) => {
      patchLoadInCache(qc, loadId, data, dispatchers);
    },
    [qc, dispatchers],
  );

  const scheduleKpiRefresh = useCallback(() => {
    clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => {
      void qc.invalidateQueries({ queryKey: ["/api/analytics"] });
    }, 300);
  }, [qc]);

  useEffect(
    () => () => {
      clearTimeout(invalidateTimer.current);
      for (const timer of patchFlushTimersRef.current.values()) {
        clearTimeout(timer);
      }
      patchFlushTimersRef.current.clear();
    },
    [],
  );

  const flushLoadPatch = useCallback(
    async (id: string) => {
      const timer = patchFlushTimersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        patchFlushTimersRef.current.delete(id);
      }

      const prev = patchInflightRef.current.get(id) ?? Promise.resolve();
      const task = prev.then(async () => {
        while (true) {
          const batch = pendingApiPatchesRef.current.get(id);
          if (!batch || Object.keys(batch).length === 0) return;
          pendingApiPatchesRef.current.delete(id);

          const load = findLoadInCache(id);
          const draftInProgress = load ? isLoadDraftInProgress({ ...load, ...batch }) : false;

          try {
            const updated = await updateLoad(id, batch, { headers: spreadsheetLoadHeaders() });
            patchLoadInCache(qc, id, updated, dispatchers);
            scheduleKpiRefresh();
          } catch (err) {
            void qc.invalidateQueries({ queryKey: ["/api/loads"] });
            const apiMsg = readPatchError(err);
            if (draftInProgress && apiMsg && /dispatcher/i.test(apiMsg)) {
              return;
            }
            toast.error(apiMsg || t("loads.sheet.saveFailed"));
            return;
          }

          if (!pendingApiPatchesRef.current.has(id)) break;
        }
      });

      patchInflightRef.current.set(id, task);
      await task;
      if (patchInflightRef.current.get(id) === task) {
        patchInflightRef.current.delete(id);
      }
    },
    [findLoadInCache, qc, dispatchers, scheduleKpiRefresh, t],
  );

  const scheduleApiPatchFlush = useCallback(
    (id: string, delayMs: number) => {
      const existing = patchFlushTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      patchFlushTimersRef.current.set(
        id,
        setTimeout(() => {
          patchFlushTimersRef.current.delete(id);
          void flushLoadPatch(id);
        }, delayMs),
      );
    },
    [flushLoadPatch],
  );

  const createMutation = useCreateLoad({
    request: { headers: spreadsheetLoadHeaders() },
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["/api/analytics"] });
      },
    },
  });

  const deleteMutation = useDeleteLoad({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/loads"] });
        qc.invalidateQueries({ queryKey: ["/api/analytics"] });
      },
    },
  });

  const patchLoad = useCallback(
    async (id: string, data: LoadUpdate) => {
      const load = findLoadInCache(id);
      if (!load) return;
      if (!ownsLoad(userRole, load, currentUserId)) return;

      let patchData = data;
      if (
        userRole === "dispatcher" &&
        currentUserId &&
        !load.dispatcherId &&
        !("dispatcherId" in patchData) &&
        !isPendingLoadId(id) &&
        id !== activeDraftLoadId
      ) {
        patchData = { ...patchData, dispatcherId: currentUserId };
      }

      const field = getPrimaryPatchField(patchData);
      const touched = draftTouchedRef.current.get(id);
      const merged = { ...load, ...patchData } as Load;
      const draftInProgress = isLoadDraftInProgress(merged);

      if (!draftInProgress && field && shouldValidateDispatcherPatch(userRole, patchData)) {
        const invalid = validateDispatcherPatchValue(field, patchData, merged, touched, {
          requireDispatcher,
        });
        if (invalid) {
          toast.error(
            t("loads.validation.fieldRequired", {
              field: t(DISPATCHER_REQUIRED_FIELD_LABEL_KEYS[invalid]),
            }),
          );
          throw new Error("validation");
        }
      }

      applyOptimisticLoadPatch(id, patchData);
      if (field) {
        const nextTouched = markDraftFieldTouched(draftTouchedRef.current, id, field);
        draftTouchedRef.current = nextTouched;
        startTransition(() => setDraftTouchedFields(nextTouched));
      }

      if (isPendingLoadId(id)) {
        const queued = pendingCreatePatchesRef.current.get(id) ?? [];
        pendingCreatePatchesRef.current.set(id, [...queued, patchData]);
        return;
      }

      const batched = { ...(pendingApiPatchesRef.current.get(id) ?? {}), ...patchData };
      pendingApiPatchesRef.current.set(id, batched);
      scheduleApiPatchFlush(id, draftInProgress ? 280 : 40);
    },
    [
      findLoadInCache,
      applyOptimisticLoadPatch,
      scheduleApiPatchFlush,
      qc,
      dispatchers,
      t,
      userRole,
      currentUserId,
      requireDispatcher,
      activeDraftLoadId,
    ],
  );

  const finalizePendingCreate = useCallback(
    async (tempId: string) => {
      const load = findLoadInCache(tempId);
      if (!load || !isPendingLoadId(tempId)) return;

      const touched = draftTouchedRef.current.get(tempId);
      const missing = getDispatcherLoadMissingFields(load, touched, { requireDispatcher: true });
      if (missing.length) {
        const labels = missing.map((f) => t(DISPATCHER_REQUIRED_FIELD_LABEL_KEYS[f]));
        toast.error(t("loads.validation.completeRequired", { fields: labels.join(", ") }));
        return;
      }

      creatingRowRef.current = true;
      setCreatingRow(true);
      try {
        const created = await createMutation.mutateAsync({
          data: {
            loadNumber: load.loadNumber,
            driverId: load.driverId ?? undefined,
            dispatcherId: load.dispatcherId ?? undefined,
            brokerId: load.brokerId ?? undefined,
            puDate: load.puDate,
            delDate: load.delDate,
            originCity: load.originCity,
            originState: load.originState,
            destCity: load.destCity,
            destState: load.destState,
            mileage: load.mileage,
            rate: load.rate,
            status: load.status ?? "Booked",
            reimbursement: load.reimbursement ?? 0,
            dispatchNotes: load.dispatchNotes ?? undefined,
            weekStart: load.weekStart,
          },
        });

        pendingCreatePatchesRef.current.delete(tempId);
        replaceLoadInCache(qc, tempId, created, dispatchers);

        const nextTouched = new Map(draftTouchedRef.current);
        nextTouched.delete(tempId);
        draftTouchedRef.current = nextTouched;
        startTransition(() => setDraftTouchedFields(nextTouched));
        setFocusCell(null);
        scheduleKpiRefresh();
      } catch {
        toast.error(t("loads.createFailed"));
      } finally {
        creatingRowRef.current = false;
        setCreatingRow(false);
      }
    },
    [findLoadInCache, createMutation, dispatchers, qc, scheduleKpiRefresh, t],
  );

  const showDraftIncompleteAlert = useCallback(
    (draftId: string) => {
      const draft = findLoadInCache(draftId);
      if (!draft) {
        toast.error(t("loads.validation.finishDraftFirst"));
        return;
      }
      const touched = draftTouchedFields.get(draftId);
      const missing = getDispatcherLoadMissingFields(draft, touched, { requireDispatcher: true });
      if (!missing.length) {
        toast.error(t("loads.validation.selectDispatcherToCreate"));
        return;
      }
      const labels = missing.map((f) => t(DISPATCHER_REQUIRED_FIELD_LABEL_KEYS[f]));
      toast.error(t("loads.validation.completeRequired", { fields: labels.join(", ") }));
    },
    [draftTouchedFields, findLoadInCache, t],
  );

  const draftCellNav = useCallback(
    (load: Load, field: SheetValidationField) => {
      const isDraft = load.id === activeDraftLoadId;
      return {
        autoEdit: isDraft && focusCell != null && focusCell.loadId === load.id && focusCell.field === field,
        onEnterAdvance: isDraft
          ? () => {
              const touched = draftTouchedFields.get(load.id);
              const next = getNextRequiredDraftField(load, {
                showRouteDetails,
                touched,
                afterField: field,
                requireDispatcher,
              });
              if (next === "dispatcherId") {
                toast.message(t("loads.validation.selectDispatcherToCreate"));
              }
              setFocusCell(next ? { loadId: load.id, field: next } : null);
            }
          : undefined,
      };
    },
    [activeDraftLoadId, draftTouchedFields, focusCell, showRouteDetails, requireDispatcher],
  );

  const addRowForDriver = useCallback(
    (driverId: string | null) => {
      if (creatingRowRef.current || activeDraftLoadId) {
        if (activeDraftLoadId) showDraftIncompleteAlert(activeDraftLoadId);
        return;
      }
      creatingRowRef.current = true;
      setCreatingRow(true);

      const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      const tempId = `pending-${suffix}`;
      const loadNumber = `NEW-${suffix}`;
      const driver = driverId ? drivers.find((d) => d.id === driverId) : undefined;
      const nextSortOrder = nextSortOrderForDriverGroup(loads, driverId, weekStart);

      const optimisticLoad: Load = {
        id: tempId,
        loadNumber,
        driverId,
        driver,
        dispatcherId: null,
        dispatcher: undefined,
        createdById: currentUserId ?? null,
        puDate: "",
        delDate: "",
        originCity: "-",
        originState: "AK",
        destCity: "-",
        destState: "AK",
        mileage: 0,
        rate: 0,
        status: "Booked",
        reimbursement: 0,
        weekStart,
        sortOrder: nextSortOrder,
        createdAt: new Date().toISOString(),
      };

      appendLoadToCache(qc, optimisticLoad);
      setFocusCell({ loadId: tempId, field: "loadNumber" });

      if (driverId) {
        setHiddenDriverIds((prev) => {
          if (!prev.has(driverId)) return prev;
          const next = new Set(prev);
          next.delete(driverId);
          persistHiddenDrivers(next);
          return next;
        });
      }

      creatingRowRef.current = false;
      setCreatingRow(false);
    },
    [
      activeDraftLoadId,
      showDraftIncompleteAlert,
      weekStart,
      persistHiddenDrivers,
      currentUserId,
      drivers,
      loads,
      qc,
    ],
  );

  const deleteDriverWeek = useCallback(
    async (driverId: string, driverName: string, weekLoads: Load[]) => {
      const confirmMsg = weekLoads.length
        ? t("loads.sheet.deleteGroupConfirm", {
            driver: driverName,
            count: weekLoads.length,
          })
        : t("loads.sheet.deleteDriverEmptyConfirm", { driver: driverName });
      if (!window.confirm(confirmMsg)) return;

      if (!weekLoads.length) {
        setHiddenDriverIds((prev) => {
          const next = new Set([...prev, driverId]);
          persistHiddenDrivers(next);
          return next;
        });
        toast.success(t("loads.sheet.deleteGroupSuccess"));
        return;
      }

      try {
        const res = await fetch(
          `/api/drivers/${driverId}/week-loads?weekStart=${encodeURIComponent(weekStart)}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "delete failed");
        }
        void qc.invalidateQueries({ queryKey: ["/api/loads"] });
        void qc.invalidateQueries({ queryKey: ["/api/analytics"] });
        toast.success(t("loads.sheet.deleteGroupSuccess"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        toast.error(msg || t("loads.sheet.deleteGroupFailed"));
      }
    },
    [qc, t, weekStart, persistHiddenDrivers],
  );

  const bulkDeleteIds = useMemo(
    () =>
      [...selectedLoadIds].filter((id) => {
        const load = loads.find((l) => l.id === id);
        return load && canDeleteLoadRow(userRole, load, currentUserId, weekEditable);
      }),
    [selectedLoadIds, loads, userRole, currentUserId, weekEditable],
  );

  const requestBulkDelete = useCallback(() => {
    if (!bulkDeleteIds.length) return;
    setBulkDeleteOpen(true);
  }, [bulkDeleteIds.length]);

  const confirmBulkDeleteSelected = useCallback(async () => {
    if (!bulkDeleteIds.length) return;
    setBulkDeleteOpen(false);
    setBulkBusy(true);
    try {
      for (const id of bulkDeleteIds) {
        await deleteMutation.mutateAsync({ id });
      }
      setSelectedLoadIds(new Set());
      toast.success(t("loads.sheet.bulkDeleteSuccess"));
    } catch {
      toast.error(t("loads.sheet.bulkDeleteFailed"));
    } finally {
      setBulkBusy(false);
    }
  }, [bulkDeleteIds, deleteMutation, t]);

  const bulkMoveToWeek = useCallback(
    async (targetWeekStart: string) => {
      const targetMonday = normalizeWeekStart(targetWeekStart);
      const movableIds = [...selectedLoadIds].filter((id) => {
        const load = loads.find((l) => l.id === id);
        return load && userRole === "accounting";
      });
      if (!movableIds.length) return;

      setBulkBusy(true);
      try {
        const res = await fetch("/api/loads/bulk-move-week", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            loadIds: movableIds,
            targetWeekStart: targetMonday,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; moved?: number };
        if (!res.ok) {
          throw new Error(body.error || "bulk move failed");
        }
        void qc.invalidateQueries({ queryKey: ["/api/loads"] });
        void qc.invalidateQueries({ queryKey: ["/api/analytics"] });
        void qc.invalidateQueries({ queryKey: ["/api/board-weeks"] });
        setSelectedLoadIds(new Set());
        setMoveWeekOpen(false);
        toast.success(t("loads.sheet.bulkMoveSuccess"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        toast.error(msg || t("loads.sheet.bulkMoveFailed"));
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedLoadIds, loads, userRole, qc, t],
  );

  const handleResizeStart = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const base = columnWidths ?? getDefaultSheetWidths(wide, showFinancial);
      const startW = base[colIndex] ?? 80;
      const onMove = (ev: MouseEvent) => {
        const nextW = Math.max(40, startW + (ev.clientX - startX));
        setColumnWidths((prev) => {
          const current = [...(prev ?? getDefaultSheetWidths(wide, showFinancial))];
          current[colIndex] = nextW;
          return current;
        });
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [columnWidths, wide, showFinancial],
  );

  const handleAutoFit = useCallback(() => {
    setColumnWidths(
      computeAutoFitWidths(loads, wide, showFinancial, t, formatCurrency, formatNumber),
    );
  }, [loads, wide, showFinancial, t, formatCurrency, formatNumber]);

  const reorderLoads = useCallback(
    async (driverId: string | null | undefined, loadIds: string[]) => {
      try {
        const res = await fetch("/api/loads/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ driverId: normalizeDriverId(driverId), loadIds }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "reorder failed");
        }
        void qc.invalidateQueries({ queryKey: ["/api/loads"] });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        const friendlyMessage =
          message.includes("other dispatchers")
            ? t("loads.sheet.reorderForbidden")
            : message === "Forbidden" && userRole === "dispatcher"
              ? t("loads.sheet.reorderForbidden")
              : message && message !== "reorder failed"
                ? message
                : t("loads.sheet.reorderFailed");
        toast.error(friendlyMessage);
      }
    },
    [qc, t, userRole],
  );

  const handleRowDrop = useCallback(
    (targetLoadId: string, groupDriverId: string | null | undefined, groupLoads: Load[]) => {
      if (!draggingLoadId || draggingLoadId === targetLoadId) return;
      if (normalizeDriverId(dragDriverId) !== normalizeDriverId(groupDriverId)) return;

      const ids = groupLoads.map((l) => l.id);
      const from = ids.indexOf(draggingLoadId);
      const to = ids.indexOf(targetLoadId);
      if (from < 0 || to < 0) return;

      const next = [...ids];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      void reorderLoads(groupDriverId, next);
      setDraggingLoadId(null);
      setDragDriverId(undefined);
      setDropTargetId(null);
    },
    [dragDriverId, draggingLoadId, reorderLoads],
  );

  const renderHeaderCell = (
    colIndex: number,
    label: React.ReactNode,
    extraClass = "",
  ) => (
    <th
      key={colIndex}
      className={`${hdrCls} ${extraClass}`}
      title={typeof label === "string" ? label : undefined}
    >
      {label}
      {colIndex !== SELECT_COL_INDEX && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("loads.sheet.resizeColumn")}
          title={t("loads.sheet.resizeColumn")}
          className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize touch-none select-none hover:bg-accent/40 active:bg-accent/60"
          onMouseDown={(e) => handleResizeStart(colIndex, e)}
        />
      )}
    </th>
  );

  const statusOptions = getStatusOptionsForRole(userRole).map((s) => ({
    value: s,
    label: translateLoadStatus(t, s),
  }));

  const dispatcherDisplayName = useCallback((d: User) => {
    const nick = (d as User & { nickname?: string | null }).nickname;
    return nick || d.name || d.email || t("dashboard.dispatcher");
  }, [t]);

  const dispatcherOptions = useMemo(() => {
    return dispatchers.map((d) => ({ value: d.id, label: dispatcherDisplayName(d) }));
  }, [dispatchers, dispatcherDisplayName]);

  const defaultDispatcherId =
    userRole === "dispatcher" && currentUserId ? currentUserId : null;

  const dispatcherLabel = useCallback(
    (dispatcherId?: string | null) => {
      if (!dispatcherId) {
        return t("common.emDash");
      }
      const d = dispatchers.find((x) => x.id === dispatcherId);
      return d ? dispatcherDisplayName(d) : t("common.emDash");
    },
    [dispatchers, dispatcherDisplayName, t],
  );

  const saveBrokerForLoad = useCallback(
    async (loadId: string, name: string) => {
      const brokerId = await resolveBrokerIdByName(name, brokers);
      await patchLoad(loadId, { brokerId });
      void qc.invalidateQueries({ queryKey: ["/api/brokers"] });
    },
    [brokers, patchLoad, qc],
  );

  const selectHeader = showActionColumn ? (
    renderHeaderCell(
      SELECT_COL_INDEX,
      <div className="flex items-center justify-center">
        <Checkbox
          checked={allLoadsSelected ? true : someLoadsSelected ? "indeterminate" : false}
          onCheckedChange={toggleSelectAll}
          disabled={!selectableLoadIds.length || !!activeDraftLoadId}
          title={t("loads.sheet.selectAllLoads")}
          aria-label={t("loads.sheet.selectAllLoads")}
          className="border-sheet-hdr-border bg-sheet-hdr data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          onClick={(e) => e.stopPropagation()}
        />
      </div>,
      "",
    )
  ) : null;

  const showAccountingFinancialStyle = userRole === "accounting" && showFinancial;

  const renderFinancialCells = (load: Load) => {
    if (!showFinancial) return null;
    const { biDiff, irDiff, hasIssue, isPending } = accountingFinancialFlags(load);
    const moneyCellCls = wide ? "px-2.5 py-1.5 font-medium tabular-nums" : "font-medium tabular-nums";

    return (
      <>
        {canEditField(userRole, "invoicedAmount", load, activeDraftLoadId, currentUserId, weekEditable) ? (
          <SheetEditableCell
            editable
            value={String(load.invoicedAmount ?? "")}
            display={
              showAccountingFinancialStyle ? (
                load.invoicedAmount != null ? (
                  <div className="min-w-0">
                    <span>{formatCurrency(load.invoicedAmount)}</span>
                    {irDiff !== null && (
                      <div
                        className={`text-[10px] truncate ${
                          irDiff < 0
                            ? "!text-orange-500 dark:!text-orange-400"
                            : "!text-green-600 dark:!text-green-400"
                        }`}
                      >
                        {t("accounting.irDiff", {
                          amount: `${irDiff >= 0 ? "+" : ""}${formatCurrency(irDiff)}`,
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{t("accounting.notInvoiced")}</span>
                )
              ) : load.invoicedAmount != null ? (
                formatCurrency(load.invoicedAmount)
              ) : (
                t("common.emDash")
              )
            }
            tooltip={
              load.invoicedAmount != null ? formatCurrency(load.invoicedAmount) : undefined
            }
            inputType="number"
            className={wide ? "px-2.5 py-1.5" : ""}
            onSave={async (v) =>
              patchLoad(load.id, { invoicedAmount: v ? Number(v) : null })
            }
          />
        ) : (
          <ReadOnlyMoneyCell value={load.invoicedAmount} formatCurrency={formatCurrency} />
        )}
        {showAccountingFinancialStyle ? (
          <SheetCopyableCell
            value={irDiff !== null ? `${irDiff >= 0 ? "+" : ""}${formatCurrency(irDiff)}` : ""}
            className={`${READONLY_CELL} accounting-money-cell`}
            title={irDiff != null ? formatCurrency(irDiff) : undefined}
          >
            {irDiff !== null ? (
              <span
                className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
                  irDiff < 0
                    ? "!text-orange-500 dark:!text-orange-400"
                    : "!text-green-600 dark:!text-green-400"
                }`}
              >
                {irDiff >= 0 ? "+" : ""}
                {formatCurrency(irDiff)}
              </span>
            ) : (
              t("common.emDash")
            )}
          </SheetCopyableCell>
        ) : (
          <ReadOnlyMoneyCell
            value={load.irDiff}
            formatCurrency={formatCurrency}
            highlightNegative
          />
        )}
        {canEditField(userRole, "brokerPaid", load, activeDraftLoadId, currentUserId, weekEditable) ? (
          <SheetEditableCell
            editable
            value={String(load.brokerPaid ?? "")}
            display={
              showAccountingFinancialStyle ? (
                load.brokerPaid != null ? (
                  <div className="flex min-w-0 items-center justify-center gap-1">
                    {!hasIssue && <Check className="h-3 w-3 shrink-0 !text-green-600 dark:!text-green-400" />}
                    <span
                      className={
                        hasIssue
                          ? "!text-red-500 dark:!text-red-400"
                          : "!text-green-600 dark:!text-green-400"
                      }
                    >
                      {formatCurrency(load.brokerPaid)}
                    </span>
                  </div>
                ) : (
                  <span
                    className={`text-[10px] font-medium ${
                      isPending
                        ? "!text-orange-500 dark:!text-orange-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isPending ? t("accounting.pending") : t("common.emDash")}
                  </span>
                )
              ) : load.brokerPaid != null ? (
                formatCurrency(load.brokerPaid)
              ) : (
                t("common.emDash")
              )
            }
            tooltip={load.brokerPaid != null ? formatCurrency(load.brokerPaid) : undefined}
            inputType="number"
            className={moneyCellCls}
            onSave={async (v) =>
              patchLoad(load.id, { brokerPaid: v ? Number(v) : null })
            }
          />
        ) : (
          <ReadOnlyMoneyCell value={load.brokerPaid} formatCurrency={formatCurrency} />
        )}
        {showAccountingFinancialStyle ? (
          <SheetCopyableCell
            value={biDiff !== null ? `${biDiff >= 0 ? "+" : ""}${formatCurrency(biDiff)}` : ""}
            className={`${READONLY_CELL} accounting-money-cell border-r-0`}
          >
            {biDiff !== null ? (
              <span
                className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
                  biDiff < 0
                    ? "!text-red-500 dark:!text-red-400"
                    : "!text-green-600 dark:!text-green-400"
                }`}
              >
                {biDiff < 0 && <AlertTriangle className="h-3 w-3 shrink-0" />}
                {biDiff >= 0 ? "+" : ""}
                {formatCurrency(biDiff)}
              </span>
            ) : (
              t("common.emDash")
            )}
          </SheetCopyableCell>
        ) : (
          <ReadOnlyMoneyCell
            value={load.biDiff}
            formatCurrency={formatCurrency}
            highlightNegative
            className="border-r-0"
          />
        )}
      </>
    );
  };

  const renderGroupTotalsRow = (
    totalMileage: number,
    avgRpm: number | null,
    totalRate: number,
    totalReimb: number,
    totalInvoiced: number,
    totalIr: number,
    totalPaid: number,
    totalBi: number,
    hasFinancialTotals: boolean,
  ) => {
    const cols = buildTotalsColumns(showRouteDetails, showFinancial, showActionColumn);
    const mileageIdx = cols.indexOf("mileage");

    return (
      <tr className="select-none sheet-totals-row">
        {cols.slice(0, mileageIdx).map((col) => {
          if (col === "driver") {
            return (
              <td key={col} className={totalLabelCls}>
                {t("loads.sheet.totals")}
              </td>
            );
          }
          return <td key={col} className={totalCellCls} />;
        })}
        {cols.slice(mileageIdx).map((col, i, rest) => {
          const isLast = i === rest.length - 1;
          switch (col) {
            case "mileage":
              return (
                <td key={col} className={totalMoneyCls}>
                  {formatNumber(totalMileage)}
                </td>
              );
            case "rpm":
              return (
                <td key={col} className={totalMoneyCls}>
                  {avgRpm != null ? formatCurrency(avgRpm) : t("common.emDash")}
                </td>
              );
            case "rate":
              return (
                <td key={col} className={totalMoneyCls}>
                  {formatCurrency(totalRate)}
                </td>
              );
            case "reimb":
              return (
                <td key={col} className={totalMoneyCls}>
                  {totalReimb ? formatCurrency(totalReimb) : t("common.emDash")}
                </td>
              );
            case "invoiced":
              return (
                <td key={col} className={totalMoneyCls}>
                  {hasFinancialTotals && totalInvoiced !== 0
                    ? formatCurrency(totalInvoiced)
                    : hasFinancialTotals
                      ? formatCurrency(0)
                      : t("common.emDash")}
                </td>
              );
            case "irDiff":
              return (
                <td
                  key={col}
                  className={`${totalMoneyCls} ${
                    showAccountingFinancialStyle
                      ? totalIr < 0
                        ? "text-orange-300"
                        : "text-green-300"
                      : totalIr < 0
                        ? "text-red-200"
                        : ""
                  }`}
                >
                  {hasFinancialTotals
                    ? showAccountingFinancialStyle
                      ? `${totalIr >= 0 ? "+" : ""}${formatCurrency(totalIr)}`
                      : formatCurrency(totalIr)
                    : t("common.emDash")}
                </td>
              );
            case "brokerPaid":
              return (
                <td
                  key={col}
                  className={`${totalMoneyCls} ${
                    showAccountingFinancialStyle && hasFinancialTotals && totalBi < 0
                      ? "text-red-300"
                      : showAccountingFinancialStyle && hasFinancialTotals
                        ? "text-green-300"
                        : ""
                  }`}
                >
                  {hasFinancialTotals && totalPaid !== 0
                    ? formatCurrency(totalPaid)
                    : hasFinancialTotals
                      ? formatCurrency(0)
                      : t("common.emDash")}
                </td>
              );
            case "biDiff":
              return (
                <td
                  key={col}
                  className={`${totalMoneyCls} ${isLast ? "border-r-0" : ""} ${
                    showAccountingFinancialStyle
                      ? totalBi < 0
                        ? "text-red-300"
                        : "text-green-300"
                      : totalBi < 0
                        ? "text-red-200"
                        : ""
                  }`}
                >
                  {hasFinancialTotals
                    ? showAccountingFinancialStyle
                      ? `${totalBi >= 0 ? "+" : ""}${formatCurrency(totalBi)}`
                      : formatCurrency(totalBi)
                    : t("common.emDash")}
                </td>
              );
            case "select":
              return <td key={col} className={totalCellCls} />;
            case "status":
              return (
                <td
                  key={col}
                  className={`${totalCellCls} ${!showFinancial ? "border-r-0" : ""}`}
                />
              );
            default:
              return (
                <td
                  key={col}
                  className={`${totalCellCls} ${!showFinancial && isLast ? "border-r-0" : ""}`}
                />
              );
          }
        })}
      </tr>
    );
  };

  const activeDraftLoad = useMemo(
    () => (activeDraftLoadId ? loads.find((l) => l.id === activeDraftLoadId) ?? null : null),
    [loads, activeDraftLoadId],
  );

  const draftMissingLabels = useMemo(() => {
    if (!activeDraftLoad) return [];
    const touched = draftTouchedFields.get(activeDraftLoad.id);
    return getDispatcherLoadMissingFields(activeDraftLoad, touched, { requireDispatcher: true }).map((f) =>
      t(DISPATCHER_REQUIRED_FIELD_LABEL_KEYS[f]),
    );
  }, [activeDraftLoad, draftTouchedFields, t]);

  return (
    <div className="relative flex flex-col min-h-0 h-full">
      <div className="flex shrink-0 flex-col border-b border-border/60 bg-muted/25 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {toolbarLeading}
            {toolbarLeading && (onWeekChange || userRole === "accounting" || userRole === "admin") ? (
              <div className="hidden h-7 w-px shrink-0 bg-border/70 sm:block" aria-hidden />
            ) : null}
            {onWeekChange && onCreateWeek ? (
              <LoadsWeekToolbar
                weekStart={weekStart}
                weeks={boardWeeks}
                onWeekChange={onWeekChange}
                onCreateWeek={onCreateWeek}
                creatingWeek={creatingWeek}
                formatDate={formatDate}
                t={t}
                canManageWeeks={userRole === "admin" || userRole === "dispatcher" || userRole === "accounting"}
              />
            ) : null}
            {(userRole === "accounting" || userRole === "admin") && (
              <WeekLockControls
                weekStart={monWeek}
                isLocked={currentWeekLockMeta?.isLocked ?? weekAccess?.isLocked ?? false}
                scheduledLockAt={
                  currentWeekLockMeta?.scheduledLockAt ?? weekAccess?.scheduledLockAt ?? null
                }
                autoLockOnWeekRollover={lockSettings?.autoLockOnWeekRollover ?? true}
                dispatchers={dispatchers}
                t={t}
                onChanged={invalidateWeekLock}
              />
            )}
            {(userRole === "accounting" || userRole === "admin") && (
              <WeekPendingRequestsButton t={t} />
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {(canToggleRouteDetails || canToggleFinancial) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={
                  isFullView
                    ? "sheet-toolbar-btn sheet-toolbar-btn--view-on"
                    : "sheet-toolbar-btn sheet-toolbar-btn--view"
                }
                onClick={toggleFullView}
                title={
                  isFullView
                    ? canToggleRouteDetails
                      ? t("loads.sheet.hideRouteDetails")
                      : t("loads.sheet.hideFinancial")
                    : canToggleRouteDetails
                      ? t("loads.sheet.showRouteDetails")
                      : t("loads.sheet.showFinancial")
                }
                data-testid="sheet-full-view"
              >
                <Eye className="h-3.5 w-3.5" />
                {t("loads.sheet.fullView")}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sheet-toolbar-btn sheet-toolbar-btn--layout"
              onClick={handleAutoFit}
              data-testid="sheet-auto-fit"
              title={t("loads.sheet.autoFit")}
            >
              <Columns2 className="h-3.5 w-3.5" />
              {t("loads.sheet.autoFit")}
            </Button>
          </div>
        </div>

        {(isLoading || kpiLoading) && (
          <div className="border-t border-border/40 px-3 py-2.5">
            <Skeleton className="h-14 w-full max-w-3xl rounded-lg" />
          </div>
        )}
        {!isLoading && !kpiLoading && toolbarStats.length > 0 && (
          <div className="border-t border-border/40 bg-muted/10 px-3 py-2.5">
            <div
              className={`grid w-full gap-2 ${
                showExtendedToolbarStats && showFinancial
                  ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-9"
                  : showExtendedToolbarStats
                    ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7"
                    : "grid-cols-2 sm:grid-cols-4"
              }`}
            >
              {toolbarStats.map((stat) => (
                <SheetToolbarStat key={stat.label} {...stat} layout="fill" />
              ))}
            </div>
          </div>
        )}

        {toolbarFilterPanel ? (
          <div className="border-t border-border/50 px-3 py-2.5">{toolbarFilterPanel}</div>
        ) : null}
      </div>
      {showGrantBanner && weekAccess?.grantExpiresAt && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          {t("weekLock.grantActiveUntil", {
            time: new Date(weekAccess.grantExpiresAt).toLocaleString(),
          })}
        </div>
      )}
      {activeDraftLoad && draftMissingLabels.length > 0 && (
        <div
          className="shrink-0 flex items-center gap-2 border-b border-amber-300/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-100"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {t("loads.validation.draftFillBanner", {
              row: rowNumberByLoadId.get(activeDraftLoad.id) ?? "—",
              fields: draftMissingLabels.join(", "),
            })}
          </span>
        </div>
      )}
      <div
        ref={containerRef}
        className={`loads-sheet-scroll relative flex-1 min-h-0 w-full rounded-t-lg ${
          columnWidths === null ? "overflow-y-auto overflow-x-hidden" : "overflow-auto"
        } ${showActionColumn && selectedLoadIds.size > 0 ? "pb-12" : ""}`}
      >
      {showWeekLockOverlay && (
        <WeekLockedOverlay
          t={t}
          onRequestPermission={() => setRequestPermissionOpen(true)}
        />
      )}
      <table
        className="loads-sheet-table w-full table-fixed border-separate border-spacing-0 text-sm border border-sheet-hdr/80"
        style={{ minWidth: tableMinWidth }}
      >
        <colgroup>
          {effectiveWidths.map((w, i) => (
            <col key={i} style={{ width: `${w}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {selectHeader}
            {renderHeaderCell(1, t("loads.sheet.rowNumber"))}
            {renderHeaderCell(2, t("loads.sheet.type"))}
            {renderHeaderCell(3, t("loads.sheet.driverName"))}
            {renderHeaderCell(4, t("loads.sheet.brokerName"))}
            {renderHeaderCell(5, t("loads.sheet.loadNumber"))}
            {showRouteDetails && (
              <>
                {renderHeaderCell(6, t("loads.sheet.puDate"))}
                {renderHeaderCell(7, t("loads.sheet.origin"))}
                {renderHeaderCell(8, t("loads.sheet.delDate"))}
                {renderHeaderCell(9, t("loads.sheet.destination"))}
              </>
            )}
            {renderHeaderCell(10, t("loads.sheet.mileage"))}
            {renderHeaderCell(11, t("loads.sheet.rpm"))}
            {renderHeaderCell(12, t("loads.sheet.rate"))}
            {renderHeaderCell(13, t("loads.sheet.dispatcher"))}
            {renderHeaderCell(14, t("loads.sheet.reimbursement"))}
            {renderHeaderCell(15, t("loads.sheet.dispatchNotes"))}
            {renderHeaderCell(16, t("loads.sheet.status"), !showFinancial ? "border-r-0" : "")}
            {showFinancial && (
              <>
                {renderHeaderCell(17, t("loads.sheet.invoicedAmount"))}
                {renderHeaderCell(18, t("loads.sheet.irDiff"))}
                {renderHeaderCell(19, t("loads.sheet.brokerPaid"))}
                {renderHeaderCell(20, t("loads.sheet.biDiff"), "border-r-0")}
              </>
            )}
          </tr>
        </thead>
      <tbody>
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: visibleColCount }).map((_, j) => (
                <td key={j} className={cellCls}>
                  <Skeleton className="h-4 w-full" />
                </td>
              ))}
            </tr>
          ))
        ) : groups.length === 0 ? (
          <tr>
            <td colSpan={visibleColCount} className={`${cellCls} border-r-0 py-16 text-center`}>
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Plus className="h-8 w-8 text-muted-foreground/50" />
                <p className="font-medium text-foreground">{emptyMessage?.title ?? t("loads.noLoads")}</p>
                <p className="text-sm">{emptyMessage?.subtitle ?? t("loads.addFirst")}</p>
                {emptyMessage?.showAdd && onAddLoad && (
                  <Button
                    className="mt-2 bg-accent hover:bg-accent/90 text-accent-foreground"
                    onClick={onAddLoad}
                  >
                    <Plus className="h-4 w-4 mr-2" /> {t("loads.addLoad")}
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ) : (
          groups.map((group, gi) => {
            const weekLoads = loadsInWeek(group.loads, weekStart);
            const weekLoadsForTotals = weekLoads.filter((l) => !isLoadDraftInProgress(l));
            const rowCount = weekLoads.length;
            const dataRows = Math.max(rowCount, 1);
            const rowSpan = dataRows;
            const totalMileage = sumField(weekLoadsForTotals, "mileage");
            const totalRate = sumField(weekLoadsForTotals, "rate");
            const totalReimb = sumField(weekLoadsForTotals, "reimbursement");
            const totalInvoiced = weekLoadsForTotals.reduce((a, l) => a + (l.invoicedAmount ?? 0), 0);
            const totalPaid = weekLoadsForTotals.reduce((a, l) => a + (l.brokerPaid ?? 0), 0);
            const totalIr = totalInvoiced - (totalRate + totalReimb);
            const totalBi = totalPaid - totalInvoiced;
            const avgRpm = totalMileage > 0 ? totalRate / totalMileage : null;
            const hasFinancialTotals = weekLoadsForTotals.some(
              (l) => l.invoicedAmount != null || l.brokerPaid != null,
            );
            const canManageDriverGroup = userRole === "admin" || userRole === "dispatcher";

            const groupSelectableIds = weekLoads
              .filter((l) => canSelectLoad(userRole, l, currentUserId, activeDraftLoadId))
              .map((l) => l.id);
            const allGroupSelected =
              groupSelectableIds.length > 0
              && groupSelectableIds.every((id) => selectedLoadIds.has(id));
            const someGroupSelected = groupSelectableIds.some((id) => selectedLoadIds.has(id));

            const driverCell = (
              <>
                <td
                  rowSpan={rowSpan}
                  className={`${groupCls} align-middle`}
                  title={driverTypeShort(group.driver?.driverType)}
                >
                  <span className={driverTypeBadgeClass(group.driver?.driverType)}>
                    {driverTypeShort(group.driver?.driverType)}
                  </span>
                </td>
                <td rowSpan={rowSpan} className={`${groupCls} font-semibold whitespace-nowrap`} title={group.driver?.fullName ?? t("loads.sheet.unassigned")}>
                  <div className="flex items-center justify-center gap-1 min-w-0 min-h-[22px]">
                    <ContextMenu>
                      <ContextMenuTrigger
                        asChild
                        disabled={!group.driverId || !canManageDriverGroup || !!activeDraftLoadId}
                      >
                        <div className="flex min-w-0 flex-1 items-center justify-center gap-1 cursor-context-menu">
                          {showActionColumn && groupSelectableIds.length > 0 && (
                            <Checkbox
                              checked={allGroupSelected ? true : someGroupSelected ? "indeterminate" : false}
                              onCheckedChange={() => toggleSelectGroup(weekLoads)}
                              disabled={!!activeDraftLoadId}
                              title={t("loads.sheet.selectGroupLoads")}
                              aria-label={t("loads.sheet.selectGroupLoads")}
                              className="shrink-0 border-border/70"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-center">
                            {group.driver?.fullName ?? t("loads.sheet.unassigned")}
                          </span>
                        </div>
                      </ContextMenuTrigger>
                      {group.driverId && canManageDriverGroup && (
                        <ContextMenuContent className="w-48">
                          <ContextMenuItem
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            onClick={() =>
                              void deleteDriverWeek(
                                group.driverId!,
                                group.driver?.fullName ?? t("loads.sheet.unassigned"),
                                weekLoads,
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t("loads.sheet.deleteGroup")}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      )}
                    </ContextMenu>
                    {canAddLoad && (
                      <button
                        type="button"
                        title={
                          addRowBlocked
                            ? t("loads.validation.finishDraftFirst")
                            : t("loads.sheet.addRow")
                        }
                        disabled={addRowBlocked}
                        className={`inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-md border transition-all duration-150 shadow-sm ${
                          addRowBlocked
                            ? "border-border/40 bg-muted/40 text-muted-foreground cursor-not-allowed opacity-50"
                            : "border-primary/30 bg-white/55 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-md backdrop-blur-sm active:scale-95 dark:border-accent/45 dark:bg-accent/20 dark:text-accent dark:hover:bg-accent dark:hover:text-accent-foreground dark:hover:border-accent"
                        }`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          addRowForDriver(group.driverId);
                        }}
                        data-testid={`add-load-row-${group.driverId ?? "unassigned"}`}
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </td>
              </>
            );

            return (
              <Fragment key={group.driverId ?? `unassigned-${gi}`}>
                {rowCount === 0 ? (
                  <tr>
                    {showActionColumn && <td className={cellCls} />}
                    <td className={ROW_NUM_CELL} />
                    {driverCell}
                    <td
                      colSpan={visibleColCount - (showActionColumn ? 4 : 3)}
                      className={`${cellCls} text-center text-muted-foreground italic ${!showFinancial ? "border-r-0" : ""}`}
                    >
                      {t("loads.sheet.clickPlus")}
                    </td>
                  </tr>
                ) : (
                  weekLoads.map((load, li) => {
                    const touched = draftTouchedFields.get(load.id);
                    const isDraftRow = load.id === activeDraftLoadId;
                    const isIncompleteRow = isLoadDraftInProgress(load);
                    const isLockedRow = !!activeDraftLoadId && !isDraftRow;
                    const isSelected = selectedLoadIds.has(load.id);
                    return (
                    <tr
                      key={load.id}
                      className={`${li % 2 === 1 ? "sheet-row-alt" : ""} ${
                        isLoadDispatcherLocked(load.status) ? "sheet-row-locked" : ""
                      } ${isLockedRow ? "opacity-45" : ""} ${
                        isIncompleteRow
                          ? "[&>td]:!bg-red-100/90 dark:[&>td]:!bg-red-950/55 [&>td]:ring-1 [&>td]:ring-inset [&>td]:ring-red-500/50"
                          : ""
                      } ${
                        isDraftRow && !isIncompleteRow ? "ring-2 ring-inset ring-accent/40" : ""
                      } ${
                        dropTargetId === load.id ? "ring-2 ring-inset ring-accent/60" : ""
                      } ${draggingLoadId === load.id ? "opacity-50" : ""} ${
                        isSelected ? "bg-primary/10 dark:bg-primary/20" : ""
                      }`}
                      data-testid={`row-load-${load.id}`}
                      onDragOver={(e) => {
                        if (!canReorderRows || draggingLoadId === null) return;
                        if (dragDriverId !== group.driverId) return;
                        e.preventDefault();
                        setDropTargetId(load.id);
                      }}
                      onDragLeave={() => {
                        if (dropTargetId === load.id) setDropTargetId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleRowDrop(load.id, group.driverId, weekLoads);
                      }}
                    >
                      {showActionColumn && (
                        <td className={`${cellCls} text-center max-w-none overflow-visible`}>
                          {canSelectLoad(userRole, load, currentUserId, activeDraftLoadId) ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectLoad(load.id)}
                              title={t("loads.sheet.selectAllLoads")}
                              aria-label={load.loadNumber || t("loads.sheet.newLoad")}
                              className="mx-auto border-border/70"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : null}
                        </td>
                      )}
                      <td className={ROW_NUM_CELL}>
                        <div className="flex items-center justify-center gap-0.5">
                          {canReorderRows && ownsLoad(userRole, load, currentUserId) && canDragReorderLoad(userRole, load) && (
                            <span
                              draggable
                              title={t("loads.sheet.dragRow")}
                              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDraggingLoadId(load.id);
                                setDragDriverId(group.driverId);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDraggingLoadId(null);
                                setDragDriverId(undefined);
                                setDropTargetId(null);
                              }}
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <span>{rowNumberByLoadId.get(load.id)}</span>
                        </div>
                      </td>
                      {li === 0 && driverCell}
                      <SheetEditableCell
                        editable={canEditField(userRole, "brokerId", load, activeDraftLoadId, currentUserId, weekEditable)}
                        value={load.broker?.name ?? ""}
                        display={load.broker?.name ?? t("common.emDash")}
                        tooltip={load.broker?.name ?? undefined}
                        className={wide ? "px-2.5 py-1.5" : ""}
                        validationState={cellValidation(load, "broker", activeDraftLoadId, touched)}
                        onSave={async (v) => saveBrokerForLoad(load.id, v)}
                      />
                      <SheetEditableCell
                        editable={canEditField(userRole, "loadNumber", load, activeDraftLoadId, currentUserId, weekEditable)}
                        value={isDraftLoadNumber(load.loadNumber) ? "" : load.loadNumber}
                        tooltip={isDraftLoadNumber(load.loadNumber) ? undefined : load.loadNumber}
                        display={
                          isDraftLoadNumber(load.loadNumber) ? (
                            <span className="text-muted-foreground">{t("common.emDash")}</span>
                          ) : (
                            <span className="font-bold text-sheet-load-id">{load.loadNumber}</span>
                          )
                        }
                        validationState={cellValidation(load, "loadNumber", activeDraftLoadId, touched)}
                        {...draftCellNav(load, "loadNumber")}
                        onSave={async (v) => {
                          const num = v.trim();
                          if (!num) {
                            throw new Error("validation");
                          }
                          await patchLoad(load.id, { loadNumber: num });
                        }}
                      />
                      {showRouteDetails && (
                        <>
                          <SheetEditableCell
                            editable={canEditField(userRole, "puDate", load, activeDraftLoadId, currentUserId, weekEditable)}
                            value={
                              isDraftDateUnset(load, "puDate", touched)
                                ? ""
                                : load.puDate.split("T")[0]
                            }
                            display={
                              isDraftDateUnset(load, "puDate", touched)
                                ? t("loads.pickDate")
                                : formatSheetDate(load.puDate)
                            }
                            inputType="date"
                            datePlaceholder={t("loads.pickDate")}
                            dateDefaultMonth={weekDefaultMonth}
                            validationState={cellValidation(load, "puDate", activeDraftLoadId, touched)}
                            {...draftCellNav(load, "puDate")}
                            onSave={async (v) => {
                              if (!v) throw new Error("validation");
                              await patchLoad(load.id, { puDate: v });
                            }}
                          />
                          <SheetEditableCell
                            editable={canEditField(userRole, "originCity", load, activeDraftLoadId, currentUserId, weekEditable)}
                            value={formatLocationForEdit(load.originCity, load.originState)}
                            tooltip={
                              isPlaceholderCity(load.originCity)
                                ? undefined
                                : formatLocationForEdit(load.originCity, load.originState)
                            }
                            display={
                              isPlaceholderCity(load.originCity)
                                ? t("common.emDash")
                                : formatLocationForEdit(load.originCity, load.originState)
                            }
                            validationState={cellValidation(load, "origin", activeDraftLoadId, touched)}
                            {...draftCellNav(load, "origin")}
                            onSave={async (v) => {
                              const { city, state } = parseCityState(v);
                              if (!city.trim()) {
                                toast.error(t("loads.validation.originRequired"));
                                throw new Error("validation");
                              }
                              await patchLoad(load.id, {
                                originCity: city.trim(),
                                originState: state.trim() || "-",
                              });
                            }}
                          />
                          <SheetEditableCell
                            editable={canEditField(userRole, "delDate", load, activeDraftLoadId, currentUserId, weekEditable)}
                            value={
                              isDraftDateUnset(load, "delDate", touched)
                                ? ""
                                : load.delDate.split("T")[0]
                            }
                            display={
                              isDraftDateUnset(load, "delDate", touched)
                                ? t("loads.pickDelDate")
                                : formatSheetDate(load.delDate)
                            }
                            inputType="date"
                            datePlaceholder={t("loads.pickDelDate")}
                            dateDefaultMonth={weekDefaultMonth}
                            validationState={cellValidation(load, "delDate", activeDraftLoadId, touched)}
                            {...draftCellNav(load, "delDate")}
                            onSave={async (v) => {
                              if (!v) throw new Error("validation");
                              await patchLoad(load.id, { delDate: v });
                            }}
                          />
                          <SheetEditableCell
                            editable={canEditField(userRole, "destCity", load, activeDraftLoadId, currentUserId, weekEditable)}
                            value={formatLocationForEdit(load.destCity, load.destState)}
                            tooltip={
                              isPlaceholderCity(load.destCity)
                                ? undefined
                                : formatLocationForEdit(load.destCity, load.destState)
                            }
                            display={
                              isPlaceholderCity(load.destCity)
                                ? t("common.emDash")
                                : formatLocationForEdit(load.destCity, load.destState)
                            }
                            validationState={cellValidation(load, "dest", activeDraftLoadId, touched)}
                            {...draftCellNav(load, "dest")}
                            onSave={async (v) => {
                              const { city, state } = parseCityState(v);
                              if (!city.trim()) {
                                toast.error(t("loads.validation.destinationRequired"));
                                throw new Error("validation");
                              }
                              await patchLoad(load.id, {
                                destCity: city.trim(),
                                destState: state.trim() || "-",
                              });
                            }}
                          />
                        </>
                      )}
                      <SheetEditableCell
                        editable={canEditField(userRole, "mileage", load, activeDraftLoadId, currentUserId, weekEditable)}
                        value={
                          isNewLoad(load) && load.mileage === 0 ? "" : String(load.mileage ?? 0)
                        }
                        display={
                          isNewLoad(load) && load.mileage === 0
                            ? t("common.emDash")
                            : formatNumber(load.mileage ?? 0)
                        }
                        inputType="number"
                        integerOnly
                        validationState={cellValidation(load, "mileage", activeDraftLoadId, touched)}
                        {...draftCellNav(load, "mileage")}
                        onSave={async (v) => {
                          if (!v.trim()) return;
                          const mileage = Number(v);
                          if (!Number.isFinite(mileage) || mileage <= 0) {
                            toast.error(t("loads.validation.mileageRequired"));
                            throw new Error("validation");
                          }
                          await patchLoad(load.id, { mileage });
                        }}
                      />
                      <SheetCopyableCell
                        value={
                          load.rpm != null && load.rpm > 0
                            ? formatCurrency(load.rpm)
                            : ""
                        }
                        className={readonlyCls}
                        title={
                          load.rpm != null && load.rpm > 0
                            ? formatCurrency(load.rpm)
                            : undefined
                        }
                      >
                        <SheetCellText>
                          {load.rpm != null && load.rpm > 0
                            ? formatCurrency(load.rpm)
                            : t("common.emDash")}
                        </SheetCellText>
                      </SheetCopyableCell>
                      <SheetEditableCell
                        editable={canEditField(userRole, "rate", load, activeDraftLoadId, currentUserId, weekEditable)}
                        value={isNewLoad(load) && load.rate === 0 ? "" : String(load.rate ?? 0)}
                        display={
                          isNewLoad(load) && load.rate === 0 ? (
                            t("common.emDash")
                          ) : (
                            <span className="font-bold text-sheet-rate">{formatCurrency(load.rate)}</span>
                          )
                        }
                        tooltip={
                          !(isNewLoad(load) && load.rate === 0)
                            ? formatCurrency(load.rate)
                            : undefined
                        }
                        inputType="number"
                        validationState={cellValidation(load, "rate", activeDraftLoadId, touched)}
                        {...draftCellNav(load, "rate")}
                        onSave={async (v) => {
                          if (!v.trim()) return;
                          const rate = Number(v);
                          if (!Number.isFinite(rate) || rate <= 0) {
                            toast.error(t("loads.validation.rateRequired"));
                            throw new Error("validation");
                          }
                          await patchLoad(load.id, { rate });
                        }}
                      />
                      <SheetDispatcherCell
                        editable={
                          canEditField(userRole, "dispatcherId", load, activeDraftLoadId, currentUserId, weekEditable)
                          && dispatcherOptions.length > 0
                        }
                        value={
                          load.id === activeDraftLoadId && isDraftDispatcherUnset(load, touched)
                            ? null
                            : load.dispatcherId
                        }
                        defaultValue={load.id === activeDraftLoadId ? null : defaultDispatcherId}
                        suppressAutoAssign={load.id === activeDraftLoadId}
                        autoFocus={
                          load.id === activeDraftLoadId &&
                          focusCell?.loadId === load.id &&
                          focusCell?.field === "dispatcherId"
                        }
                        autoOpen={
                          load.id === activeDraftLoadId &&
                          focusCell?.loadId === load.id &&
                          focusCell?.field === "dispatcherId"
                        }
                        label={
                          load.dispatcherId && !isDraftDispatcherUnset(load, touched)
                            ? dispatcherLabel(load.dispatcherId)
                            : t("common.emDash")
                        }
                        placeholder={
                          load.id === activeDraftLoadId
                            ? t("loads.pickDispatcher")
                            : t("loads.allDispatchers")
                        }
                        options={dispatcherOptions}
                        className={wide ? "px-2.5 py-1.5" : ""}
                        validationState={cellValidation(load, "dispatcherId", activeDraftLoadId, touched)}
                        onSave={async (v) => {
                          if (!v) return;
                          await patchLoad(load.id, { dispatcherId: v });
                          if (isPendingLoadId(load.id)) {
                            await finalizePendingCreate(load.id);
                          }
                        }}
                      />
                      <SheetEditableCell
                        editable={canEditField(userRole, "reimbursement", load, activeDraftLoadId, currentUserId, weekEditable)}
                        value={
                          isNewLoad(load) && (load.reimbursement ?? 0) === 0 && !touched?.has("reimbursement")
                            ? ""
                            : String(load.reimbursement ?? 0)
                        }
                        display={
                          isNewLoad(load) && (load.reimbursement ?? 0) === 0 && !touched?.has("reimbursement")
                            ? t("common.emDash")
                            : load.reimbursement
                            ? formatCurrency(load.reimbursement)
                            : t("common.emDash")
                        }
                        tooltip={
                          load.reimbursement ? formatCurrency(load.reimbursement) : undefined
                        }
                        inputType="number"
                        validationState={cellValidation(load, "reimbursement", activeDraftLoadId, touched)}
                        onSave={async (v) => {
                          if (!v.trim()) {
                            await patchLoad(load.id, { reimbursement: 0 });
                            return;
                          }
                          const reimbursement = Number(v);
                          if (!Number.isFinite(reimbursement) || reimbursement < 0) {
                            toast.error(t("loads.validation.reimbursementInvalid"));
                            throw new Error("validation");
                          }
                          await patchLoad(load.id, { reimbursement });
                        }}
                      />
                      <SheetEditableCell
                        editable={canEditField(userRole, "dispatchNotes", load, activeDraftLoadId, currentUserId, weekEditable)}
                        value={load.dispatchNotes ?? ""}
                        tooltip={load.dispatchNotes ?? undefined}
                        className={wide ? "max-w-none px-2.5 py-1.5" : "max-w-none"}
                        validationState={cellValidation(load, "dispatchNotes", activeDraftLoadId, touched)}
                        onSave={async (v) => patchLoad(load.id, { dispatchNotes: v || null })}
                      />
                      <SheetEditableCell
                        editable={canEditField(userRole, "status", load, activeDraftLoadId, currentUserId, weekEditable)}
                        value={load.status}
                        tooltip={translateLoadStatusDesc(t, load.status) ?? translateLoadStatus(t, load.status)}
                        display={<SheetStatus status={load.status} />}
                        selectOptions={statusOptions}
                        className={wide ? "px-2.5 py-1.5" : ""}
                        validationState={cellValidation(load, "status", activeDraftLoadId, touched)}
                        onSave={async (v) =>
                          patchLoad(load.id, { status: v as LoadUpdate["status"] })
                        }
                      />
                      {renderFinancialCells(load)}
                    </tr>
                    );
                  })
                )}
                {renderGroupTotalsRow(
                  totalMileage,
                  avgRpm,
                  totalRate,
                  totalReimb,
                  totalInvoiced,
                  totalIr,
                  totalPaid,
                  totalBi,
                  hasFinancialTotals,
                )}
              </Fragment>
            );
          })
        )}
      </tbody>
    </table>
    </div>
    {showActionColumn && (
      <LoadsBulkActionBar
        count={selectedLoadIds.size}
        busy={bulkBusy}
        canDelete={canBulkDelete}
        canMoveWeek={canBulkMoveWeek}
        onDelete={requestBulkDelete}
        onMoveWeek={() => setMoveWeekOpen(true)}
        onClear={clearSelection}
        t={t}
      />
    )}
    {canBulkMoveWeek && (
      <LoadsBulkMoveWeekDialog
        open={moveWeekOpen}
        onOpenChange={setMoveWeekOpen}
        weeks={boardWeeks}
        currentWeekStart={weekStart}
        count={selectedLoadIds.size}
        busy={bulkBusy}
        formatDate={formatDate}
        t={t}
        onConfirm={(ws) => void bulkMoveToWeek(ws)}
      />
    )}
    <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("loads.sheet.bulkDeleteDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-destructive">
                {t("loads.sheet.bulkDeleteDialogWarning")}
              </p>
              <p>
                {t("loads.sheet.bulkDeleteDialogQuestion", { count: bulkDeleteIds.length })}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkBusy}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={bulkBusy}
            onClick={(e) => {
              e.preventDefault();
              void confirmBulkDeleteSelected();
            }}
          >
            {bulkBusy ? t("common.saving") : t("loads.sheet.bulkDelete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <WeekPermissionRequestDialog
      open={requestPermissionOpen}
      onOpenChange={setRequestPermissionOpen}
      weekStart={monWeek}
      loads={loads.filter(
        (l) =>
          normalizeWeekStart(l.weekStart || l.puDate) === monWeek
          && ownsLoad(userRole, l, currentUserId),
      )}
      t={t}
      onSubmitted={() => void refetchWeekAccess()}
    />
    </div>
  );
}
