import { useCallback, useMemo, useState, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListDrivers, type Driver } from "@workspace/api-client-react";
import type { DriverTodayBlock, DriverChipFilter, DispatcherDriverGroup } from "@/lib/drivers-today";
import { filterStatusboardSections } from "@/lib/drivers-today";
import {
  DRIVER_BOARD_STATUSES,
  DRIVER_BOARD_STATUS_I18N,
  DRIVER_BOARD_STATUS_STYLES,
  DRIVER_BOARD_STATUS_COLORS,
  resolveDriverBoardStatus,
  type DriverBoardStatus,
  isDriverBoardStatus,
} from "@/lib/driver-board-status";
import { useI18n } from "@/lib/i18n";
import { invalidateDriverQueries } from "@/lib/invalidate-driver-queries";
import { canEditDriverBoardRow } from "@/lib/can-edit-driver-board-row";
import { QuickAddDriverDialog } from "@/components/quick-add-driver-dialog";
import { DriverSearchSelect, MODERN_ADD_BTN } from "@/components/driver-search-select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseCityState, formatLocationForEdit } from "@/components/sheet-editable-cell";
import { isLoadDispatcherLocked } from "@/lib/load-statuses";
import { isPlaceholderCity } from "@/lib/validate-dispatcher-load";
import {
  datetimeLocalDatePart,
  datetimeLocalToIso,
  formatScheduledDateTime,
  toDatetimeLocalValue,
} from "@/lib/scheduled-datetime";
import { toast } from "sonner";

const DRIVER_TYPE_KEYS: Record<string, string> = {
  OO: "drivers.ooShort",
  CD: "drivers.cdShort",
  Lease: "drivers.lease",
};

const DRIVER_TYPE_STYLES: Record<string, string> = {
  OO: "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800",
  CD: "bg-green-100 text-green-800 border border-green-200 dark:bg-green-950/50 dark:text-green-200 dark:border-green-800",
  Lease: "bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-800",
};

function resolveBoardLoad(
  block: DriverTodayBlock,
  sectionDispatcherId: string | null,
  groupByDispatcher: boolean,
) {
  if (!block.loads.length) return undefined;
  if (!groupByDispatcher) return block.loads[0];
  if (sectionDispatcherId === null) {
    return block.loads.find((l) => !l.dispatcherId) ?? block.loads[0];
  }
  return block.loads.find((l) => l.dispatcherId === sectionDispatcherId) ?? block.loads[0];
}

const MODERN_ADD_ICON = "h-2.5 w-2.5 stroke-[3]";

const COL_COUNT = 14;

function sectionKey(section: { dispatcherId: string | null; dispatcherName: string }): string {
  return section.dispatcherId ?? `unassigned:${section.dispatcherName}`;
}

function cityState(city: string, state: string): string {
  if (!city || city === "-") return "";
  return state && state !== "-" ? `${city}, ${state}` : city;
}

function formatScheduledRange(
  puScheduledAt?: string | null,
  delScheduledAt?: string | null,
  puDate?: string | null,
  delDate?: string | null,
  formatDateTime?: (d: string | Date) => string,
  formatDate?: (d: string) => string,
): string {
  const pu = formatScheduledDateTime(puScheduledAt, puDate, formatDateTime, formatDate);
  const del = formatScheduledDateTime(delScheduledAt, delDate, formatDateTime, formatDate);
  if (!pu) return "";
  if (!del || del === pu) return pu;
  return `${pu} – ${del}`;
}

type DriverStatusboardProps = {
  filter: DriverChipFilter;
  driverFilterId?: string | null;
  dispatcherFilterKey?: string | null;
  drivers: DriverTodayBlock[];
  groups?: DispatcherDriverGroup[];
  weekStart: string;
  groupByDispatcher: boolean;
  editorUserId?: string | null;
  editorRole?: string | null;
  scopedDispatcherId?: string | null;
};

export function DriverStatusboard({
  filter,
  driverFilterId = null,
  dispatcherFilterKey = null,
  drivers,
  groups,
  weekStart,
  groupByDispatcher,
  editorUserId,
  editorRole,
  scopedDispatcherId = null,
}: DriverStatusboardProps) {
  const { t, formatDate } = useI18n();
  const formatDateTime = useCallback(
    (d: string | Date) =>
      new Date(d).toLocaleString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [],
  );
  const qc = useQueryClient();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, DriverBoardStatus>>({});
  const [draftSectionKey, setDraftSectionKey] = useState<string | null>(null);
  const [draftDriverId, setDraftDriverId] = useState("");
  const [draftSectionDispatcherId, setDraftSectionDispatcherId] = useState<string | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [driverAddOpen, setDriverAddOpen] = useState(false);
  const [swapDriverLoadId, setSwapDriverLoadId] = useState<string | null>(null);

  const resolveFlatDispatcherId = useCallback((): string | null => {
    if (scopedDispatcherId) return scopedDispatcherId;
    if (editorRole === "dispatcher" && editorUserId) return editorUserId;
    return null;
  }, [editorRole, editorUserId, scopedDispatcherId]);

  const { data: driversList } = useListDrivers({ isActive: true });
  const activeDrivers = useMemo(
    () => (driversList ?? []).filter((d: Driver) => d.isActive),
    [driversList],
  );

  const patchDriver = useCallback(
    async (driverId: string, body: Record<string, unknown>) => {
      setSavingKey(`driver:${driverId}`);
      try {
        const res = await fetch(`/api/drivers/${driverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "save failed");
        }
        void invalidateDriverQueries(qc);
        return true;
      } catch {
        toast.error(t("statusboard.saveFailed"));
        return false;
      } finally {
        setSavingKey(null);
      }
    },
    [qc, t],
  );

  const patchLoad = useCallback(
    async (loadId: string, body: Record<string, unknown>) => {
      setSavingKey(`load:${loadId}`);
      try {
        const res = await fetch(`/api/loads/${loadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const message = (err as { error?: string }).error ?? "save failed";
          throw new Error(message);
        }
        await Promise.all([
          invalidateDriverQueries(qc),
          qc.invalidateQueries({ queryKey: ["/api/loads"] }),
          qc.invalidateQueries({ queryKey: ["/api/analytics"] }),
        ]);
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : t("statusboard.loadSaveFailed");
        toast.error(message === "save failed" ? t("statusboard.loadSaveFailed") : message);
        return false;
      } finally {
        setSavingKey(null);
      }
    },
    [qc, t],
  );

  const createLoadForDriver = useCallback(
    async (
      driverId: string,
      loadNumber: string,
      sectionDispatcherId: string | null,
    ) => {
      try {
        const dispatcherId =
          editorRole === "dispatcher"
            ? editorUserId
            : sectionDispatcherId;
        const res = await fetch("/api/loads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            loadNumber: `NEW-${crypto.randomUUID().slice(0, 8)}`,
            driverId,
            dispatcherId: dispatcherId ?? null,
            weekStart,
            puDate: weekStart,
            delDate: weekStart,
            originCity: "-",
            originState: "-",
            destCity: "-",
            destState: "-",
            mileage: 1,
            rate: 1,
            status: "Booked",
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "create failed");
        }
        const created = (await res.json()) as { id: string };
        if (loadNumber.trim()) {
          return patchLoad(created.id, { loadNumber });
        }
        await Promise.all([
          invalidateDriverQueries(qc),
          qc.invalidateQueries({ queryKey: ["/api/loads"] }),
          qc.invalidateQueries({ queryKey: ["/api/analytics"] }),
        ]);
        return true;
      } catch {
        toast.error(t("statusboard.loadSaveFailed"));
        return false;
      }
    },
    [editorRole, editorUserId, weekStart, patchLoad, qc, t],
  );

  const startDraftRow = useCallback(
    (section: { dispatcherId: string | null; dispatcherName: string }) => {
      if (draftSectionKey) {
        toast.error(t("statusboard.finishDraftFirst"));
        return;
      }
      setDraftSectionKey(sectionKey(section));
      setDraftSectionDispatcherId(section.dispatcherId);
      setDraftDriverId("");
    },
    [draftSectionKey, t],
  );

  const cancelDraftRow = useCallback(() => {
    setDraftSectionKey(null);
    setDraftSectionDispatcherId(null);
    setDraftDriverId("");
  }, []);

  const confirmDraftDriver = useCallback(
    async (driverId: string) => {
      if (!driverId || addingRow) return;
      setAddingRow(true);
      const ok = await createLoadForDriver(driverId, "", draftSectionDispatcherId);
      if (ok) {
        cancelDraftRow();
      }
      setAddingRow(false);
    },
    [addingRow, cancelDraftRow, createLoadForDriver, draftSectionDispatcherId],
  );

  const swapDriverOnLoad = useCallback(
    async (loadId: string, driverId: string) => {
      if (!driverId) return;
      setSavingKey(`load:${loadId}`);
      try {
        const res = await fetch(`/api/loads/${loadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ driverId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "save failed");
        }
        await Promise.all([
          invalidateDriverQueries(qc),
          qc.invalidateQueries({ queryKey: ["/api/loads"] }),
          qc.invalidateQueries({ queryKey: ["/api/analytics"] }),
        ]);
      } catch (e) {
        const message = e instanceof Error ? e.message : t("statusboard.driverSwapFailed");
        if (message === "No valid fields to update") {
          toast.error(t("statusboard.driverSwapFailed"));
        } else if (message === "save failed") {
          toast.error(t("statusboard.driverSwapFailed"));
        } else {
          toast.error(message);
        }
      } finally {
        setSavingKey(null);
      }
    },
    [qc, t],
  );

  const deleteLoadRow = useCallback(
    async (load: { id: string; loadNumber?: string | null }) => {
      const label = load.loadNumber?.trim() || load.id.slice(0, 8);
      if (!window.confirm(t("loads.sheet.deleteRowConfirm", { loadNumber: label }))) return;
      setSavingKey(`load:${load.id}`);
      try {
        const res = await fetch(`/api/loads/${load.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "delete failed");
        }
        await Promise.all([
          invalidateDriverQueries(qc),
          qc.invalidateQueries({ queryKey: ["/api/loads"] }),
          qc.invalidateQueries({ queryKey: ["/api/analytics"] }),
        ]);
        toast.success(t("loads.sheet.deleteRowSuccess"));
      } catch (e) {
        const message = e instanceof Error ? e.message : t("loads.sheet.deleteRowFailed");
        toast.error(message === "delete failed" ? t("loads.sheet.deleteRowFailed") : message);
      } finally {
        setSavingKey(null);
      }
    },
    [qc, t],
  );

  const sections = useMemo(
    () =>
      filterStatusboardSections(
        drivers,
        groups,
        groupByDispatcher,
        filter,
        driverFilterId,
        dispatcherFilterKey,
      ),
    [groupByDispatcher, groups, drivers, filter, driverFilterId, dispatcherFilterKey],
  );

  const displaySections = useMemo(() => {
    if (!draftSectionKey) return sections;
    if (sections.some((s) => sectionKey(s) === draftSectionKey)) return sections;
    if (groupByDispatcher && groups?.length) {
      const match = groups.find((g) => sectionKey(g) === draftSectionKey);
      if (match) return [...sections, { ...match, drivers: [] }];
    }
    if (!groupByDispatcher) {
      return [
        {
          dispatcherId: draftSectionDispatcherId ?? resolveFlatDispatcherId(),
          dispatcherName: "",
          drivers: [] as DriverTodayBlock[],
        },
      ];
    }
    return sections;
  }, [draftSectionKey, draftSectionDispatcherId, groupByDispatcher, groups, resolveFlatDispatcherId, sections]);

  const totalRows = displaySections.reduce((n, s) => n + s.drivers.length, 0);
  const showTable = totalRows > 0 || draftSectionKey !== null;

  const flatCanAdd =
    !groupByDispatcher &&
    canEditDriverBoardRow({
      editorRole,
      editorUserId,
      sectionDispatcherId: editorRole === "dispatcher" ? editorUserId ?? null : null,
      groupByDispatcher: false,
    });

  const hdr = cn(
    "px-2 py-2.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap sticky top-0 z-20",
    "text-foreground bg-muted/90 border border-border",
    "dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700",
  );
  const cell = cn(
    "px-2 py-1.5 text-xs border border-border bg-card text-foreground align-middle",
    "dark:bg-slate-900/60 dark:text-slate-100 dark:border-slate-700",
  );
  const inputCls =
    "w-full bg-transparent border-0 outline-none text-xs p-0 text-foreground placeholder:text-muted-foreground dark:placeholder:text-slate-500";

  const renderRow = (
    block: DriverTodayBlock,
    section: { dispatcherId: string | null },
  ) => {
    const load = resolveBoardLoad(block, section.dispatcherId, groupByDispatcher);
    const d = block.driver;
    const boardStatus = (statusOverrides[d.id]
      ?? resolveDriverBoardStatus(d.boardStatus)) as DriverBoardStatus;
    const rowCanEdit = canEditDriverBoardRow({
      editorRole,
      editorUserId,
      sectionDispatcherId: section.dispatcherId,
      groupByDispatcher,
    });
    const loadCanEdit =
      rowCanEdit &&
      !!load &&
      !(
        editorRole === "dispatcher" &&
        load.status &&
        isLoadDispatcherLocked(load.status)
      ) &&
      !(
        editorRole === "dispatcher" &&
        load.dispatcherId &&
        editorUserId &&
        load.dispatcherId !== editorUserId
      );
    const rowSaving = savingKey === `driver:${d.id}` || (load && savingKey === `load:${load.id}`);

    const loadInputClass = cn(inputCls, "min-w-[72px]");

    const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") e.currentTarget.blur();
    };

    return (
      <tr
        key={d.id}
        className={cn(
          "transition-colors",
          rowCanEdit
            ? "hover:bg-muted/50 dark:hover:bg-slate-800/70"
            : "bg-muted/10 dark:bg-slate-900/40",
          rowSaving && "opacity-60",
        )}
      >
        <td className={cn(cell, "tabular-nums whitespace-nowrap min-w-[88px]")} onClick={(e) => e.stopPropagation()}>
          {rowCanEdit ? (
            <input
              className={cn(inputCls, "min-w-[72px]")}
              defaultValue={d.truckNumber ?? ""}
              placeholder={t("common.emDash")}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === (d.truckNumber ?? "")) return;
                void patchDriver(d.id, { truckNumber: v || null });
              }}
              onKeyDown={blurOnEnter}
            />
          ) : (
            d.truckNumber ?? t("common.emDash")
          )}
        </td>
        <td className={cn(cell, "font-semibold text-foreground min-w-[160px]")} onClick={(e) => e.stopPropagation()}>
          {rowCanEdit && load && loadCanEdit ? (
            <DriverSearchSelect
              value={d.id}
              drivers={activeDrivers}
              className="min-w-[150px]"
              onValueChange={(v) => {
                if (v === d.id) return;
                void swapDriverOnLoad(load.id, v);
              }}
              onAddClick={() => {
                setSwapDriverLoadId(load.id);
                setDriverAddOpen(true);
              }}
            />
          ) : rowCanEdit ? (
            <input
              className={cn(inputCls, "min-w-[120px] font-semibold")}
              defaultValue={d.fullName}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v || v === d.fullName) return;
                void patchDriver(d.id, { fullName: v });
              }}
              onKeyDown={blurOnEnter}
            />
          ) : (
            d.fullName
          )}
        </td>
        <td className={cn(cell, "tabular-nums whitespace-nowrap")} onClick={(e) => e.stopPropagation()}>
          {rowCanEdit ? (
            <input
              className={cn(inputCls, "min-w-[100px]")}
              defaultValue={d.phone ?? ""}
              placeholder={t("common.emDash")}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === (d.phone ?? "")) return;
                void patchDriver(d.id, { phone: v || null });
              }}
              onKeyDown={blurOnEnter}
            />
          ) : (
            d.phone ?? t("common.emDash")
          )}
        </td>
        <td className={cell} onClick={(e) => e.stopPropagation()}>
          {rowCanEdit ? (
            <select
              className={cn(
                "w-full min-w-[110px] text-[11px] font-semibold rounded-md border px-1.5 py-0.5 cursor-pointer bg-transparent",
                DRIVER_TYPE_STYLES[d.driverType] ?? "bg-muted text-muted-foreground border-border",
              )}
              value={d.driverType}
              onChange={(e) => {
                const next = e.target.value;
                if (next === d.driverType) return;
                void patchDriver(d.id, { driverType: next });
              }}
            >
              {(["OO", "CD", "Lease"] as const).map((type) => (
                <option key={type} value={type}>
                  {t(DRIVER_TYPE_KEYS[type])}
                </option>
              ))}
            </select>
          ) : (
            <span
              className={cn(
                "inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                DRIVER_TYPE_STYLES[d.driverType] ?? "bg-muted text-muted-foreground border border-border",
              )}
            >
              {t(DRIVER_TYPE_KEYS[d.driverType] ?? d.driverType)}
            </span>
          )}
        </td>
        <td className={cn(cell, "text-right tabular-nums font-medium")} onClick={(e) => e.stopPropagation()}>
          <input
            className={cn(inputCls, "min-w-[60px] text-right tabular-nums")}
            defaultValue={d.odometer != null ? String(d.odometer) : ""}
            placeholder={t("common.emDash")}
            disabled={!rowCanEdit}
            inputMode="numeric"
            pattern="[0-9]*"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
                return;
              }
              if (
                e.key.length === 1 &&
                !/^\d$/.test(e.key) &&
                !e.ctrlKey &&
                !e.metaKey
              ) {
                e.preventDefault();
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (!/^\d*$/.test(text.trim())) e.preventDefault();
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              const digits = el.value.replace(/\D/g, "");
              if (el.value !== digits) el.value = digits;
            }}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              if (raw === "") {
                if (d.odometer != null) void patchDriver(d.id, { odometer: null });
                return;
              }
              const next = Number(raw);
              if (!Number.isFinite(next) || !/^\d+$/.test(raw)) {
                e.target.value = d.odometer != null ? String(d.odometer) : "";
                return;
              }
              if (next === (d.odometer ?? null)) return;
              void patchDriver(d.id, { odometer: next });
            }}
          />
        </td>
        <td className={cn(cell, "font-bold whitespace-nowrap min-w-[72px]")} onClick={(e) => e.stopPropagation()}>
          {rowCanEdit ? (
            <input
              className={cn(loadInputClass, "font-bold")}
              defaultValue={load?.loadNumber ?? ""}
              placeholder={t("common.emDash")}
              disabled={!!load && !loadCanEdit}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (load) {
                  if (!loadCanEdit) return;
                  if (v === (load.loadNumber ?? "")) return;
                  if (!v) {
                    e.target.value = load.loadNumber ?? "";
                    return;
                  }
                  void patchLoad(load.id, { loadNumber: v });
                  return;
                }
                if (!v) return;
                void createLoadForDriver(d.id, v, section.dispatcherId);
              }}
              onKeyDown={blurOnEnter}
            />
          ) : load ? (
            load.loadNumber ?? t("common.emDash")
          ) : (
            t("common.emDash")
          )}
        </td>
        <td className={cn(cell, "min-w-[120px]")} onClick={(e) => e.stopPropagation()}>
          {load ? (
            loadCanEdit ? (
              <input
                className={loadInputClass}
                defaultValue={formatLocationForEdit(load.originCity, load.originState)}
                placeholder={t("common.emDash")}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const current = formatLocationForEdit(load.originCity, load.originState);
                  if (v === current) return;
                  const { city, state } = parseCityState(v);
                  if (!city.trim()) {
                    e.target.value = current;
                    return;
                  }
                  void patchLoad(load.id, {
                    originCity: city.trim(),
                    originState: state.trim() || "-",
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              isPlaceholderCity(load.originCity)
                ? t("common.emDash")
                : cityState(load.originCity, load.originState) || t("common.emDash")
            )
          ) : (
            t("common.emDash")
          )}
        </td>
        <td className={cn(cell, "min-w-[120px]")} onClick={(e) => e.stopPropagation()}>
          {load ? (
            loadCanEdit ? (
              <input
                className={loadInputClass}
                defaultValue={formatLocationForEdit(load.destCity, load.destState)}
                placeholder={t("common.emDash")}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const current = formatLocationForEdit(load.destCity, load.destState);
                  if (v === current) return;
                  const { city, state } = parseCityState(v);
                  if (!city.trim()) {
                    e.target.value = current;
                    return;
                  }
                  void patchLoad(load.id, {
                    destCity: city.trim(),
                    destState: state.trim() || "-",
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              isPlaceholderCity(load.destCity)
                ? t("common.emDash")
                : cityState(load.destCity, load.destState) || t("common.emDash")
            )
          ) : (
            t("common.emDash")
          )}
        </td>
        <td className={cn(cell, "whitespace-nowrap text-[11px]")} onClick={(e) => e.stopPropagation()}>
          {load ? (
            loadCanEdit ? (
              <div className="flex flex-col gap-1 min-w-[148px]">
                <input
                  type="datetime-local"
                  className={cn(loadInputClass, "dark:[color-scheme:dark]")}
                  defaultValue={toDatetimeLocalValue(load.puScheduledAt, load.puDate)}
                  title={t("statusboard.pickupTime")}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const current = toDatetimeLocalValue(load.puScheduledAt, load.puDate);
                    if (v === current) return;
                    void patchLoad(load.id, {
                      puScheduledAt: datetimeLocalToIso(v),
                      puDate: datetimeLocalDatePart(v),
                    });
                  }}
                />
                <input
                  type="datetime-local"
                  className={cn(loadInputClass, "text-muted-foreground dark:text-slate-400 dark:[color-scheme:dark]")}
                  defaultValue={toDatetimeLocalValue(load.delScheduledAt, load.delDate)}
                  title={t("statusboard.deliveryTime")}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const current = toDatetimeLocalValue(load.delScheduledAt, load.delDate);
                    if (v === current) return;
                    void patchLoad(load.id, {
                      delScheduledAt: datetimeLocalToIso(v),
                      delDate: datetimeLocalDatePart(v),
                    });
                  }}
                />
              </div>
            ) : (
              formatScheduledRange(
                load.puScheduledAt,
                load.delScheduledAt,
                load.puDate,
                load.delDate,
                formatDateTime,
                formatDate,
              )
            )
          ) : (
            t("common.emDash")
          )}
        </td>
        <td
          className={cell}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            className={cn(inputCls, "min-w-[80px]")}
            defaultValue={d.eta ?? ""}
            placeholder={t("common.emDash")}
            disabled={!rowCanEdit}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (d.eta ?? "")) return;
              void patchDriver(d.id, { eta: v || null });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </td>
        <td className={cell} onClick={(e) => e.stopPropagation()}>
          {rowCanEdit ? (
            <select
              className={cn(
                "w-full min-w-[110px] text-xs font-semibold rounded border px-1.5 py-1 cursor-pointer",
                DRIVER_BOARD_STATUS_STYLES[boardStatus],
              )}
              value={boardStatus}
              onChange={async (e) => {
                const next = e.target.value;
                if (!isDriverBoardStatus(next) || next === boardStatus) return;
                const prev = boardStatus;
                setStatusOverrides((s) => ({ ...s, [d.id]: next }));
                const ok = await patchDriver(d.id, { boardStatus: next });
                if (!ok) {
                  setStatusOverrides((s) => ({ ...s, [d.id]: prev }));
                } else {
                  setStatusOverrides((s) => {
                    const copy = { ...s };
                    delete copy[d.id];
                    return copy;
                  });
                }
              }}
            >
              {DRIVER_BOARD_STATUSES.map((s) => {
                const c = DRIVER_BOARD_STATUS_COLORS[s];
                return (
                  <option
                    key={s}
                    value={s}
                    style={{ backgroundColor: c.bg, color: c.text }}
                  >
                    {t(DRIVER_BOARD_STATUS_I18N[s])}
                  </option>
                );
              })}
            </select>
          ) : (
            <span
              className={cn(
                "inline-flex w-full min-w-[110px] justify-center rounded border px-1.5 py-1 text-xs font-semibold",
                DRIVER_BOARD_STATUS_STYLES[boardStatus],
              )}
            >
              {t(DRIVER_BOARD_STATUS_I18N[boardStatus])}
            </span>
          )}
        </td>
        <td className={cell} onClick={(e) => e.stopPropagation()}>
          <input
            className={cn(inputCls, "min-w-[70px]")}
            defaultValue={d.prebook ?? ""}
            placeholder={t("common.emDash")}
            disabled={!rowCanEdit}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (d.prebook ?? "")) return;
              void patchDriver(d.id, { prebook: v || null });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </td>
        <td className={cell} onClick={(e) => e.stopPropagation()}>
          <input
            className={cn(inputCls, "min-w-[100px]")}
            defaultValue={d.boardNote ?? ""}
            placeholder={t("common.emDash")}
            disabled={!rowCanEdit}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (d.boardNote ?? "")) return;
              void patchDriver(d.id, { boardNote: v || null });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </td>
        <td className={cn(cell, "text-center w-9 p-0")} onClick={(e) => e.stopPropagation()}>
          {load && loadCanEdit ? (
            <button
              type="button"
              title={t("loads.sheet.deleteRow")}
              className="inline-flex items-center justify-center w-7 h-7 mx-auto rounded text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-40"
              disabled={rowSaving}
              data-testid={`statusboard-delete-row-${load.id}`}
              onClick={() => void deleteLoadRow(load)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </td>
      </tr>
    );
  };

  const renderDraftRow = (section: DispatcherDriverGroup) => {
    const sectionDriverIds = new Set(section.drivers.map((b) => b.driver.id));
    const pickableDrivers = activeDrivers.filter((d: Driver) => !sectionDriverIds.has(d.id));
    const preview = activeDrivers.find((d: Driver) => d.id === draftDriverId);

    return (
      <tr
        key={`draft-${sectionKey(section)}`}
        className="bg-primary/5 dark:bg-primary/10"
        data-testid="statusboard-draft-row"
      >
        <td className={cn(cell, "tabular-nums whitespace-nowrap min-w-[88px]")}>
          {preview?.truckNumber ?? t("common.emDash")}
        </td>
        <td className={cn(cell, "min-w-[180px]")} onClick={(e) => e.stopPropagation()}>
          <DriverSearchSelect
            value={draftDriverId}
            drivers={pickableDrivers}
            disabled={addingRow}
            addDisabled={addingRow}
            onValueChange={(v) => {
              setDraftDriverId(v);
              void confirmDraftDriver(v);
            }}
            onAddClick={() => setDriverAddOpen(true)}
          />
        </td>
        <td className={cn(cell, "tabular-nums whitespace-nowrap")}>
          {preview?.phone ?? t("common.emDash")}
        </td>
        <td className={cell}>
          {preview ? (
            <span
              className={cn(
                "inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                DRIVER_TYPE_STYLES[preview.driverType] ??
                  "bg-muted text-muted-foreground border border-border",
              )}
            >
              {t(DRIVER_TYPE_KEYS[preview.driverType] ?? preview.driverType)}
            </span>
          ) : (
            t("common.emDash")
          )}
        </td>
        <td colSpan={COL_COUNT - 4} className={cn(cell, "text-muted-foreground text-[11px]")}>
          <div className="flex items-center justify-between gap-2">
            <span>
              {addingRow ? t("statusboard.addingRow") : t("statusboard.selectDriver")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title={t("common.cancel")}
              disabled={addingRow}
              onClick={cancelDraftRow}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div
      className="mt-4 rounded-xl border-2 border-border bg-card overflow-hidden shadow-sm"
      data-testid="driver-statusboard"
    >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30 dark:bg-slate-900/50">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("statusboard.title")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("statusboard.subtitle")}</p>
          </div>
          <div className="flex flex-col sm:items-end gap-2">
            {totalRows > 0 && (
              <p className="text-xs text-muted-foreground font-medium">
                {totalRows} {t("dashboard.driver").toLowerCase()}(s)
              </p>
            )}
            {flatCanAdd && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  MODERN_ADD_BTN,
                  "!h-6 !w-auto !min-h-6 px-2 gap-1 rounded-full font-medium text-[10px]",
                )}
                disabled={!!draftSectionKey || addingRow}
                title={t("statusboard.addRow")}
                onClick={() =>
                  startDraftRow({
                    dispatcherId: resolveFlatDispatcherId(),
                    dispatcherName: "",
                  })
                }
              >
                <Plus className={MODERN_ADD_ICON} />
                {t("statusboard.addRow")}
              </Button>
            )}
          </div>
        </div>

        {!showTable ? (
          <p className="p-8 text-sm text-center text-muted-foreground">
            {driverFilterId || dispatcherFilterKey
              ? t("statusboard.noDriversForFilter")
              : filter === "all"
              ? t("dashboard.noDriversToday")
              : t("statusboard.noDriversWithStatus", {
                  status: t(DRIVER_BOARD_STATUS_I18N[filter]),
                })}
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
            <table className="w-full min-w-[1200px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(hdr, "whitespace-nowrap")}>{t("statusboard.truckNumber")}</th>
                  <th className={cn(hdr, "text-left")}>{t("statusboard.driverName")}</th>
                  <th className={hdr}>{t("statusboard.phone")}</th>
                  <th className={hdr}>{t("statusboard.type")}</th>
                  <th className={cn(hdr, "text-right")}>{t("statusboard.odometer")}</th>
                  <th className={hdr}>{t("statusboard.loadId")}</th>
                  <th className={cn(hdr, "text-left")}>{t("statusboard.origin")}</th>
                  <th className={cn(hdr, "text-left")}>{t("statusboard.destination")}</th>
                  <th className={hdr}>{t("statusboard.scheduledTime")}</th>
                  <th className={hdr}>{t("statusboard.eta")}</th>
                  <th className={hdr}>{t("statusboard.status")}</th>
                  <th className={hdr}>{t("statusboard.prebook")}</th>
                  <th className={cn(hdr, "text-left")}>{t("statusboard.note")}</th>
                  <th className={cn(hdr, "w-9 p-1")} aria-label={t("loads.sheet.deleteRow")}>
                    <span className="sr-only">{t("loads.sheet.deleteRow")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displaySections.map((section) => (
                  <Fragment key={section.dispatcherId ?? `section-${section.dispatcherName}`}>
                    {groupByDispatcher && section.dispatcherName && (
                      <tr>
                        <td
                          colSpan={COL_COUNT}
                          className={cn(
                            "px-3 py-2 text-sm font-bold uppercase tracking-wide sticky top-[41px] z-10",
                            "bg-green-100 text-green-900 border border-green-200",
                            "dark:bg-green-950/55 dark:text-green-200 dark:border-green-800",
                          )}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            {canEditDriverBoardRow({
                              editorRole,
                              editorUserId,
                              sectionDispatcherId: section.dispatcherId,
                              groupByDispatcher,
                            }) &&
                              section.dispatcherId !== null && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className={MODERN_ADD_BTN}
                                  title={t("statusboard.addRow")}
                                  disabled={!!draftSectionKey || addingRow}
                                  data-testid={`statusboard-add-row-${section.dispatcherId}`}
                                  onClick={() => startDraftRow(section)}
                                >
                                  <Plus className={MODERN_ADD_ICON} />
                                </Button>
                              )}
                            <span>
                              {section.dispatcherName === "Unassigned"
                                ? t("statusboard.unassigned")
                                : section.dispatcherName}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {section.drivers.map((block) => renderRow(block, section))}
                    {draftSectionKey === sectionKey(section) && renderDraftRow(section)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <QuickAddDriverDialog
        open={driverAddOpen}
        onClose={() => {
          setDriverAddOpen(false);
          setSwapDriverLoadId(null);
        }}
        onCreated={(driverId) => {
          if (swapDriverLoadId) {
            void swapDriverOnLoad(swapDriverLoadId, driverId);
            setSwapDriverLoadId(null);
          } else {
            setDraftDriverId(driverId);
            void confirmDraftDriver(driverId);
          }
        }}
      />
    </div>
  );
}
