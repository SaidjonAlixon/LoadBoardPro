import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Broker, Driver, Load, LoadStatus, LoadUpdate } from "@workspace/api-client-react";
import { useCreateLoad, useDeleteLoad, updateLoad } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { LoadsWeekToolbar, type BoardWeek } from "@/components/loads-week-toolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Eye, Trash2, Columns2, GripVertical } from "lucide-react";
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
} from "@/components/sheet-column-widths";
import { resolveBrokerIdByName } from "@/lib/resolve-broker";
import { getMondayOfWeek, getThisWeekStart, normalizeWeekStart, toIsoDateLocal, weekEndFromStart } from "@/lib/date-range";
import {
  DISPATCHER_REQUIRED_FIELD_LABEL_KEYS,
  getActiveDraftLoadId,
  getDispatcherFieldValidation,
  getPrimaryPatchField,
  isDispatcherLoadComplete,
  isDraftLoadNumber,
  isPlaceholderCity,
  markDraftFieldTouched,
  shouldValidateDispatcherPatch,
  validateDispatcherPatchValue,
  type SheetValidationField,
} from "@/lib/validate-dispatcher-load";
import { toast } from "sonner";

const COL_COUNT_BASE = 17; // #, type..status + eye toggle
const EYE_COL_INDEX = 16;
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
  | "action"
  | "invoiced"
  | "irDiff"
  | "brokerPaid"
  | "biDiff";

function buildTotalsColumns(
  showRouteDetails: boolean,
  showFinancial: boolean,
  showActionColumn: boolean,
): TotalsColumn[] {
  const cols: TotalsColumn[] = ["hash", "type", "driver", "broker", "loadNum"];
  if (showRouteDetails) cols.push("puDate", "origin", "delDate", "dest");
  cols.push("mileage", "rpm", "rate", "dispatcher", "reimb", "notes", "status");
  if (showActionColumn) cols.push("action");
  if (showFinancial) cols.push("invoiced", "irDiff", "brokerPaid", "biDiff");
  return cols;
}

const HDR =
  "bg-sheet-hdr text-sheet-hdr-fg text-[10px] font-bold uppercase px-1.5 py-1 border-r border-sheet-hdr-border sticky top-0 z-10 text-center align-middle overflow-hidden text-ellipsis whitespace-nowrap relative";
const CELL =
  `px-1.5 py-0.5 border-r border-b border-sheet-border text-[11px] bg-sheet-cell text-sheet-cell-fg text-center align-middle ${SHEET_CELL_CLIP}`;
const GROUP_CELL =
  "px-1.5 py-0.5 border-r border-b border-sheet-border text-[11px] bg-sheet-group text-sheet-cell-fg text-center align-middle font-semibold whitespace-nowrap";
const TOTAL_CELL =
  `px-1.5 py-0.5 border-r border-b border-sheet-hdr-border text-[11px] bg-sheet-total text-sheet-total-fg font-bold text-center align-middle ${SHEET_CELL_CLIP}`;
const TOTAL_MONEY_CELL =
  "px-1.5 py-0.5 border-r border-b border-sheet-hdr-border text-[11px] bg-sheet-total text-sheet-total-fg font-bold text-center align-middle tabular-nums whitespace-nowrap";
const TOTAL_LABEL_CELL =
  "px-1.5 py-0.5 border-r border-b border-sheet-hdr-border text-[11px] bg-sheet-total text-sheet-total-fg font-semibold text-center align-middle whitespace-nowrap";
const READONLY_CELL = `${CELL} text-muted-foreground bg-sheet-readonly`;
const ROW_NUM_CELL = `${CELL} text-muted-foreground bg-sheet-readonly font-medium tabular-nums`;

function canEditField(
  role: string,
  field: string,
  load?: Load,
  activeDraftLoadId?: string | null,
  currentUserId?: string | null,
): boolean {
  if (load && activeDraftLoadId && load.id !== activeDraftLoadId) return false;
  if (load && role === "dispatcher") {
    if (!currentUserId || load.dispatcherId !== currentUserId) return false;
    if (isLoadDispatcherLocked(load.status)) return false;
  }
  if (["rpm", "irDiff", "biDiff", "type", "driver", "dispatcher"].includes(field)) return false;
  if (role === "accounting") return ACCOUNTING_FIELDS.has(field);
  if (role === "dispatcher") return DISPATCHER_FIELDS.has(field);
  if (role === "admin") return ACCOUNTING_FIELDS.has(field) || DISPATCHER_FIELDS.has(field) || field === "driverId";
  return false;
}

function canDeleteLoadRow(
  role: string,
  load: Load,
  currentUserId?: string | null,
): boolean {
  if (isLoadDispatcherLocked(load.status)) return false;
  if (role === "admin") return true;
  if (role === "dispatcher") {
    return !!currentUserId && load.dispatcherId === currentUserId;
  }
  return false;
}

function ownsLoad(role: string, load: Load, currentUserId?: string | null): boolean {
  if (role === "admin") return true;
  if (role === "dispatcher") return !!currentUserId && load.dispatcherId === currentUserId;
  return false;
}

function cellValidation(
  load: Load,
  field: SheetValidationField,
  activeDraftLoadId: string | null,
  touched?: Set<string>,
): "valid" | "invalid" | "neutral" {
  if (!activeDraftLoadId || load.id !== activeDraftLoadId) return "neutral";
  return getDispatcherFieldValidation(load, field, touched);
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
      className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase ${getSheetStatusClass(status)}`}
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
    return <td className={`${READONLY_CELL} ${className}`}>{t("common.emDash")}</td>;
  }
  const neg = highlightNegative && value < 0;
  const text = formatCurrency(value);
  return (
    <td
      className={`${READONLY_CELL} font-medium ${neg ? "bg-red-200 text-red-900" : ""} ${className}`}
      title={text}
    >
      <SheetCellText>{text}</SheetCellText>
    </td>
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
  filterDriverId?: string;
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
  filterDriverId,
}: LoadsSpreadsheetProps) {
  const weekStart = weekStartProp ?? getThisWeekStart();
  const { t, formatCurrency, formatNumber, formatDate } = useI18n();
  const qc = useQueryClient();
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
      }).filter((g) => !g.driverId || !hiddenDriverIds.has(g.driverId)),
    [loads, drivers, hiddenDriverIds, compactDriverGroups, filterDriverId],
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
  const canAddLoad = userRole === "dispatcher" || userRole === "admin";
  const canReorder = canAddLoad;
  const [draftTouchedFields, setDraftTouchedFields] = useState<Map<string, Set<string>>>(new Map());
  const activeDraftLoadId = useMemo(
    () => getActiveDraftLoadId(loads, draftTouchedFields),
    [loads, draftTouchedFields],
  );
  const canReorderRows = canReorder && !activeDraftLoadId;
  const [draggingLoadId, setDraggingLoadId] = useState<string | null>(null);
  const [dragDriverId, setDragDriverId] = useState<string | null | undefined>(undefined);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const canToggleFinancial = userRole !== "accounting";
  const canToggleRouteDetails = userRole === "accounting";
  const showActionColumn = userRole === "dispatcher" || userRole === "admin";
  const [showFinancial, setShowFinancial] = useState(userRole === "accounting");
  const [showRouteDetails, setShowRouteDetails] = useState(userRole !== "accounting");
  const [focusCell, setFocusCell] = useState<{ loadId: string; field: string } | null>(null);
  const [columnWidths, setColumnWidths] = useState<number[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    setShowFinancial(userRole === "accounting");
    setShowRouteDetails(userRole !== "accounting");
  }, [userRole]);

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
  const tableMinWidth = Math.max(
    baseEffectiveWidths.reduce((sum, w) => sum + w, 0),
    containerWidth,
  );

  useEffect(() => {
    setColumnWidths(null);
  }, [wide, showFinancial, showRouteDetails]);
  const cellCls = wide ? `${CELL} px-2.5 py-1.5 text-xs` : CELL;
  const hdrCls = wide ? `${HDR} px-2.5 py-1.5 text-xs` : HDR;
  const groupCls = wide ? `${GROUP_CELL} px-2.5 py-1.5 text-xs` : GROUP_CELL;
  const readonlyCls = wide ? `${READONLY_CELL} px-2.5 py-1.5 text-xs` : READONLY_CELL;
  const totalLabelCls = wide
    ? "px-2.5 py-1.5 text-xs border-r border-b border-sheet-hdr-border bg-sheet-total text-sheet-total-fg font-semibold text-center align-middle whitespace-nowrap"
    : TOTAL_LABEL_CELL;
  const visibleColCount = buildTotalsColumns(
    showRouteDetails,
    showFinancial,
    showActionColumn,
  ).length;

  const toggleFullView = useCallback(() => {
    if (canToggleRouteDetails) setShowRouteDetails((v) => !v);
    else setShowFinancial((v) => !v);
  }, [canToggleRouteDetails]);

  const saveChains = useRef(new Map<string, Promise<void>>());
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const scheduleLoadsRefresh = useCallback(() => {
    clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => {
      void qc.invalidateQueries({ queryKey: ["/api/loads"] });
    }, 400);
  }, [qc]);

  useEffect(
    () => () => {
      clearTimeout(invalidateTimer.current);
    },
    [],
  );

  const createMutation = useCreateLoad({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/loads"] });
        qc.invalidateQueries({ queryKey: ["/api/analytics"] });
      },
    },
  });

  const deleteMutation = useDeleteLoad({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/loads"] });
        qc.invalidateQueries({ queryKey: ["/api/analytics"] });
        qc.invalidateQueries({ queryKey: ["/api/weekly"] });
      },
    },
  });

  const patchLoad = useCallback(
    async (id: string, data: LoadUpdate) => {
      const load = loads.find((l) => l.id === id);
      if (!load) return;
      if (!ownsLoad(userRole, load, currentUserId)) return;

      const field = getPrimaryPatchField(data);
      const merged = { ...load, ...data } as Load;
      const touched = draftTouchedFields.get(id);

      if (field && shouldValidateDispatcherPatch(userRole, data)) {
        const incomplete = !isDispatcherLoadComplete(load, touched);
        if (incomplete) {
          const invalid = validateDispatcherPatchValue(field, data, merged, touched);
          if (invalid) {
            toast.error(
              t("loads.validation.fieldRequired", {
                field: t(DISPATCHER_REQUIRED_FIELD_LABEL_KEYS[invalid]),
              }),
            );
            throw new Error("validation");
          }
        }
      }

      const run = async () => {
        await updateLoad(id, data);
        if (field) {
          setDraftTouchedFields((prev) => markDraftFieldTouched(prev, id, field));
        }
        scheduleLoadsRefresh();
        setFocusCell(null);
      };

      const prev = saveChains.current.get(id) ?? Promise.resolve();
      const next = prev
        .then(run)
        .catch((err) => {
          if (err?.message !== "validation") {
            toast.error(t("loads.sheet.saveFailed"));
          }
          throw err;
        });

      saveChains.current.set(
        id,
        next.catch(() => undefined),
      );

      await next;
    },
    [draftTouchedFields, loads, scheduleLoadsRefresh, t, userRole, currentUserId],
  );

  const addRowForDriver = useCallback(
    async (driverId: string | null) => {
      if (activeDraftLoadId) {
        toast.error(t("loads.validation.finishDraftFirst"));
        return;
      }
      const today = toIsoDateLocal(new Date());
      const weekEnd = weekEndFromStart(weekStart);
      const defaultDate = today >= weekStart && today <= weekEnd ? today : weekStart;
      const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      try {
        const created = await createMutation.mutateAsync({
          data: {
            loadNumber: `NEW-${suffix}`,
            driverId,
            puDate: defaultDate,
            delDate: defaultDate,
            originCity: "-",
            originState: "AK",
            destCity: "-",
            destState: "AK",
            mileage: 0,
            rate: 0,
            status: "Booked",
            reimbursement: 0,
            weekStart,
          },
        });
        setFocusCell({ loadId: created.id, field: "loadNumber" });
        if (driverId) {
          setHiddenDriverIds((prev) => {
            if (!prev.has(driverId)) return prev;
            const next = new Set(prev);
            next.delete(driverId);
            persistHiddenDrivers(next);
            return next;
          });
        }
      } catch {
        toast.error(t("loads.createFailed"));
      }
    },
    [activeDraftLoadId, createMutation, t, weekStart, persistHiddenDrivers],
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
        void qc.invalidateQueries({ queryKey: ["/api/weekly"] });
        toast.success(t("loads.sheet.deleteGroupSuccess"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        toast.error(msg || t("loads.sheet.deleteGroupFailed"));
      }
    },
    [qc, t, weekStart, persistHiddenDrivers],
  );

  const deleteLoad = useCallback(
    async (load: Load) => {
      const label = isNewLoad(load) ? t("loads.sheet.newLoad") : load.loadNumber;
      if (!window.confirm(t("loads.sheet.deleteRowConfirm", { loadNumber: label }))) return;
      try {
        await deleteMutation.mutateAsync({ id: load.id });
        toast.success(t("loads.sheet.deleteRowSuccess"));
      } catch {
        toast.error(t("loads.sheet.deleteRowFailed"));
      }
    },
    [deleteMutation, t],
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
    async (driverId: string | null, loadIds: string[]) => {
      try {
        const res = await fetch("/api/loads/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ driverId, loadIds }),
        });
        if (!res.ok) throw new Error("reorder failed");
        void qc.invalidateQueries({ queryKey: ["/api/loads"] });
      } catch {
        toast.error(t("loads.sheet.reorderFailed"));
      }
    },
    [qc, t],
  );

  const handleRowDrop = useCallback(
    (targetLoadId: string, groupDriverId: string | null, groupLoads: Load[]) => {
      if (!draggingLoadId || draggingLoadId === targetLoadId) return;
      if (dragDriverId !== groupDriverId) return;

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
      {colIndex !== EYE_COL_INDEX && (
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

  const saveBrokerForLoad = useCallback(
    async (loadId: string, name: string) => {
      const brokerId = await resolveBrokerIdByName(name, brokers);
      await patchLoad(loadId, { brokerId });
      void qc.invalidateQueries({ queryKey: ["/api/brokers"] });
    },
    [brokers, patchLoad, qc],
  );

  const eyeHeader = showActionColumn ? (
    <th
      key="eye"
      className={`${hdrCls} text-center max-w-none overflow-visible ${!showFinancial ? "border-r-0" : ""}`}
    />
  ) : null;

  const renderFinancialCells = (load: Load) => {
    if (!showFinancial) return null;
    return (
      <>
        {canEditField(userRole, "invoicedAmount", load, activeDraftLoadId, currentUserId) ? (
          <SheetEditableCell
            editable
            value={String(load.invoicedAmount ?? "")}
            display={
              load.invoicedAmount != null
                ? formatCurrency(load.invoicedAmount)
                : t("common.emDash")
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
        <ReadOnlyMoneyCell
          value={load.irDiff}
          formatCurrency={formatCurrency}
          highlightNegative
        />
        {canEditField(userRole, "brokerPaid", load, activeDraftLoadId, currentUserId) ? (
          <SheetEditableCell
            editable
            value={String(load.brokerPaid ?? "")}
            display={
              load.brokerPaid != null
                ? formatCurrency(load.brokerPaid)
                : t("common.emDash")
            }
            tooltip={load.brokerPaid != null ? formatCurrency(load.brokerPaid) : undefined}
            inputType="number"
            className={wide ? "px-2.5 py-1.5" : ""}
            onSave={async (v) =>
              patchLoad(load.id, { brokerPaid: v ? Number(v) : null })
            }
          />
        ) : (
          <ReadOnlyMoneyCell value={load.brokerPaid} formatCurrency={formatCurrency} />
        )}
        <ReadOnlyMoneyCell
          value={load.biDiff}
          formatCurrency={formatCurrency}
          highlightNegative
          className="border-r-0"
        />
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
          return <td key={col} className={TOTAL_CELL} />;
        })}
        {cols.slice(mileageIdx).map((col, i, rest) => {
          const isLast = i === rest.length - 1;
          switch (col) {
            case "mileage":
              return (
                <td key={col} className={TOTAL_MONEY_CELL}>
                  {formatNumber(totalMileage)}
                </td>
              );
            case "rpm":
              return (
                <td key={col} className={TOTAL_MONEY_CELL}>
                  {avgRpm != null ? formatCurrency(avgRpm) : t("common.emDash")}
                </td>
              );
            case "rate":
              return (
                <td key={col} className={TOTAL_MONEY_CELL}>
                  {formatCurrency(totalRate)}
                </td>
              );
            case "reimb":
              return (
                <td key={col} className={TOTAL_MONEY_CELL}>
                  {totalReimb ? formatCurrency(totalReimb) : t("common.emDash")}
                </td>
              );
            case "invoiced":
              return (
                <td key={col} className={TOTAL_MONEY_CELL}>
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
                  className={`${TOTAL_MONEY_CELL} ${totalIr < 0 ? "bg-red-700" : ""}`}
                >
                  {hasFinancialTotals ? formatCurrency(totalIr) : t("common.emDash")}
                </td>
              );
            case "brokerPaid":
              return (
                <td key={col} className={TOTAL_MONEY_CELL}>
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
                  className={`${TOTAL_MONEY_CELL} ${isLast ? "border-r-0" : ""} ${totalBi < 0 ? "bg-red-700" : ""}`}
                >
                  {hasFinancialTotals ? formatCurrency(totalBi) : t("common.emDash")}
                </td>
              );
            case "action":
              return (
                <td
                  key={col}
                  className={`${TOTAL_CELL} ${!showFinancial && isLast ? "border-r-0" : ""}`}
                />
              );
            default:
              return (
                <td
                  key={col}
                  className={`${TOTAL_CELL} ${!showFinancial && isLast ? "border-r-0" : ""}`}
                />
              );
          }
        })}
      </tr>
    );
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border bg-muted/30 shrink-0">
        {onWeekChange && onCreateWeek ? (
          <LoadsWeekToolbar
            weekStart={weekStart}
            weeks={boardWeeks}
            onWeekChange={onWeekChange}
            onCreateWeek={onCreateWeek}
            creatingWeek={creatingWeek}
            formatDate={formatDate}
            t={t}
            canManageWeeks={userRole === "admin" || userRole === "dispatcher"}
          />
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
        {(canToggleRouteDetails || canToggleFinancial) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-8 text-xs gap-1.5 ${
              isFullView
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                : "border-border text-muted-foreground"
            }`}
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
          className="h-8 text-xs border-border"
          onClick={handleAutoFit}
          data-testid="sheet-auto-fit"
        >
          <Columns2 className="h-3.5 w-3.5 mr-1.5" />
          {t("loads.sheet.autoFit")}
        </Button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 w-full overflow-auto">
      <table
        className="w-full table-fixed border-collapse text-sm border border-border"
        style={{ minWidth: tableMinWidth }}
      >
        <colgroup>
          {effectiveWidths.map((w, i) => (
            <col key={i} style={{ width: `${w}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {renderHeaderCell(0, t("loads.sheet.rowNumber"))}
            {renderHeaderCell(1, t("loads.sheet.type"))}
            {renderHeaderCell(2, t("loads.sheet.driverName"))}
            {renderHeaderCell(3, t("loads.sheet.brokerName"))}
            {renderHeaderCell(4, t("loads.sheet.loadNumber"))}
            {showRouteDetails && (
              <>
                {renderHeaderCell(5, t("loads.sheet.puDate"))}
                {renderHeaderCell(6, t("loads.sheet.origin"))}
                {renderHeaderCell(7, t("loads.sheet.delDate"))}
                {renderHeaderCell(8, t("loads.sheet.destination"))}
              </>
            )}
            {renderHeaderCell(9, t("loads.sheet.mileage"))}
            {renderHeaderCell(10, t("loads.sheet.rpm"))}
            {renderHeaderCell(11, t("loads.sheet.rate"))}
            {renderHeaderCell(12, t("loads.sheet.dispatcher"))}
            {renderHeaderCell(13, t("loads.sheet.reimbursement"))}
            {renderHeaderCell(14, t("loads.sheet.dispatchNotes"))}
            {renderHeaderCell(15, t("loads.sheet.status"))}
            {eyeHeader}
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
            const rowCount = weekLoads.length;
            const dataRows = Math.max(rowCount, 1);
            const rowSpan = dataRows;
            const totalMileage = sumField(weekLoads, "mileage");
            const totalRate = sumField(weekLoads, "rate");
            const totalReimb = sumField(weekLoads, "reimbursement");
            const totalInvoiced = weekLoads.reduce((a, l) => a + (l.invoicedAmount ?? 0), 0);
            const totalPaid = weekLoads.reduce((a, l) => a + (l.brokerPaid ?? 0), 0);
            const totalIr = totalInvoiced - (totalRate + totalReimb);
            const totalBi = totalPaid - totalInvoiced;
            const avgRpm = totalMileage > 0 ? totalRate / totalMileage : null;
            const hasFinancialTotals = weekLoads.some(
              (l) => l.invoicedAmount != null || l.brokerPaid != null,
            );
            const ownWeekLoads = weekLoads.filter((l) => ownsLoad(userRole, l, currentUserId));
            const canManageDriverGroup =
              userRole === "admin"
              || weekLoads.length === 0
              || ownWeekLoads.length > 0;

            const driverCell = (
              <>
                <td
                  rowSpan={rowSpan}
                  className={`${groupCls} text-center`}
                  title={driverTypeShort(group.driver?.driverType)}
                >
                  {driverTypeShort(group.driver?.driverType)}
                </td>
                <td rowSpan={rowSpan} className={groupCls} title={group.driver?.fullName ?? t("loads.sheet.unassigned")}>
                  <ContextMenu>
                    <ContextMenuTrigger
                      asChild
                      disabled={!group.driverId || !canManageDriverGroup || !!activeDraftLoadId}
                    >
                      <div className="flex items-center justify-center gap-1 min-w-0 min-h-[22px] cursor-context-menu">
                        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-center">
                          {group.driver?.fullName ?? t("loads.sheet.unassigned")}
                        </span>
                        <div className="flex flex-col gap-1 shrink-0">
                          {canAddLoad && (
                            <button
                              type="button"
                              title={
                                activeDraftLoadId
                                  ? t("loads.validation.finishDraftFirst")
                                  : t("loads.sheet.addRow")
                              }
                              disabled={!!activeDraftLoadId}
                              className={`w-5 h-5 flex items-center justify-center text-sm font-bold leading-none ${
                                activeDraftLoadId
                                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                                  : "bg-accent text-accent-foreground hover:bg-accent/90"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void addRowForDriver(group.driverId);
                              }}
                              data-testid={`add-load-row-${group.driverId ?? "unassigned"}`}
                            >
                              +
                            </button>
                          )}
                        </div>
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
                              userRole === "admin" ? weekLoads : ownWeekLoads,
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t("loads.sheet.deleteGroup")}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    )}
                  </ContextMenu>
                </td>
              </>
            );

            return (
              <Fragment key={group.driverId ?? `unassigned-${gi}`}>
                {rowCount === 0 ? (
                  <tr>
                    <td className={ROW_NUM_CELL} />
                    {driverCell}
                    <td
                      colSpan={visibleColCount - 3}
                      className={`${cellCls} text-center text-muted-foreground italic ${!showFinancial ? "border-r-0" : ""}`}
                    >
                      {t("loads.sheet.clickPlus")}
                    </td>
                  </tr>
                ) : (
                  weekLoads.map((load, li) => {
                    const touched = draftTouchedFields.get(load.id);
                    const isDraftRow = load.id === activeDraftLoadId;
                    const isLockedRow = !!activeDraftLoadId && !isDraftRow;
                    return (
                    <tr
                      key={load.id}
                      className={`${li % 2 === 1 ? "sheet-row-alt" : ""} ${
                        isLoadDispatcherLocked(load.status) ? "sheet-row-locked" : ""
                      } ${isLockedRow ? "opacity-45" : ""} ${
                        isDraftRow ? "ring-2 ring-inset ring-accent/40" : ""
                      } ${
                        dropTargetId === load.id ? "ring-2 ring-inset ring-accent/60" : ""
                      } ${draggingLoadId === load.id ? "opacity-50" : ""}`}
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
                      <td className={ROW_NUM_CELL}>
                        <div className="flex items-center justify-center gap-0.5">
                          {canReorderRows && ownsLoad(userRole, load, currentUserId) && !isLoadDispatcherLocked(load.status) && (
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
                        editable={canEditField(userRole, "brokerId", load, activeDraftLoadId, currentUserId)}
                        value={load.broker?.name ?? ""}
                        display={load.broker?.name ?? t("common.emDash")}
                        tooltip={load.broker?.name ?? undefined}
                        className={wide ? "px-2.5 py-1.5" : ""}
                        validationState={cellValidation(load, "broker", activeDraftLoadId, touched)}
                        onSave={async (v) => saveBrokerForLoad(load.id, v)}
                      />
                      <SheetEditableCell
                        editable={canEditField(userRole, "loadNumber", load, activeDraftLoadId, currentUserId)}
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
                        autoEdit={
                          focusCell?.loadId === load.id && focusCell.field === "loadNumber"
                        }
                        onSave={async (v) => {
                          const num = v.trim();
                          if (!num) {
                            setFocusCell(null);
                            return;
                          }
                          await patchLoad(load.id, { loadNumber: num });
                        }}
                      />
                      {showRouteDetails && (
                        <>
                          <SheetEditableCell
                            editable={canEditField(userRole, "puDate", load, activeDraftLoadId, currentUserId)}
                            value={load.puDate.split("T")[0]}
                            display={formatSheetDate(load.puDate)}
                            inputType="date"
                            validationState={cellValidation(load, "puDate", activeDraftLoadId, touched)}
                            onSave={async (v) => patchLoad(load.id, { puDate: v })}
                          />
                          <SheetEditableCell
                            editable={canEditField(userRole, "originCity", load, activeDraftLoadId, currentUserId)}
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
                            editable={canEditField(userRole, "delDate", load, activeDraftLoadId, currentUserId)}
                            value={load.delDate.split("T")[0]}
                            display={formatSheetDate(load.delDate)}
                            inputType="date"
                            validationState={cellValidation(load, "delDate", activeDraftLoadId, touched)}
                            onSave={async (v) => patchLoad(load.id, { delDate: v })}
                          />
                          <SheetEditableCell
                            editable={canEditField(userRole, "destCity", load, activeDraftLoadId, currentUserId)}
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
                        editable={canEditField(userRole, "mileage", load, activeDraftLoadId, currentUserId)}
                        value={
                          isNewLoad(load) && load.mileage === 0 ? "" : String(load.mileage ?? 0)
                        }
                        display={
                          isNewLoad(load) && load.mileage === 0
                            ? t("common.emDash")
                            : formatNumber(load.mileage ?? 0)
                        }
                        inputType="number"
                        validationState={cellValidation(load, "mileage", activeDraftLoadId, touched)}
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
                      <td
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
                      </td>
                      <SheetEditableCell
                        editable={canEditField(userRole, "rate", load, activeDraftLoadId, currentUserId)}
                        value={isNewLoad(load) && load.rate === 0 ? "" : String(load.rate ?? 0)}
                        display={
                          isNewLoad(load) && load.rate === 0 ? (
                            t("common.emDash")
                          ) : (
                            <span className="font-semibold">{formatCurrency(load.rate)}</span>
                          )
                        }
                        tooltip={
                          !(isNewLoad(load) && load.rate === 0)
                            ? formatCurrency(load.rate)
                            : undefined
                        }
                        inputType="number"
                        validationState={cellValidation(load, "rate", activeDraftLoadId, touched)}
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
                      <td className={readonlyCls} title={load.dispatcher?.name ?? undefined}>
                        <SheetCellText>
                          {load.dispatcher?.name ?? t("common.emDash")}
                        </SheetCellText>
                      </td>
                      <SheetEditableCell
                        editable={canEditField(userRole, "reimbursement", load, activeDraftLoadId, currentUserId)}
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
                            toast.error(t("loads.validation.reimbursementRequired"));
                            throw new Error("validation");
                          }
                          const reimbursement = Number(v);
                          if (!Number.isFinite(reimbursement) || reimbursement < 0) {
                            toast.error(t("loads.validation.reimbursementRequired"));
                            throw new Error("validation");
                          }
                          await patchLoad(load.id, { reimbursement });
                        }}
                      />
                      <SheetEditableCell
                        editable={canEditField(userRole, "dispatchNotes", load, activeDraftLoadId, currentUserId)}
                        value={load.dispatchNotes ?? ""}
                        tooltip={load.dispatchNotes ?? undefined}
                        className={wide ? "max-w-none px-2.5 py-1.5" : "max-w-none"}
                        validationState={cellValidation(load, "dispatchNotes", activeDraftLoadId, touched)}
                        onSave={async (v) => patchLoad(load.id, { dispatchNotes: v || null })}
                      />
                      <SheetEditableCell
                        editable={canEditField(userRole, "status", load, activeDraftLoadId, currentUserId)}
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
                      {showActionColumn && (
                        <td
                          className={`${cellCls} text-center max-w-none overflow-visible w-9 ${!showFinancial ? "border-r-0" : ""}`}
                        >
                          {canDeleteLoadRow(userRole, load, currentUserId) && !isLockedRow ? (
                            <button
                              type="button"
                              title={t("loads.sheet.deleteRow")}
                              className="inline-flex items-center justify-center w-6 h-6 rounded text-red-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteLoad(load);
                              }}
                              data-testid={`delete-load-${load.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </td>
                      )}
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
    </div>
  );
}
