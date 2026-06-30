import { useMemo, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Lock, Plus, Trash2 } from "lucide-react";
import {
  addDays,
  formatWeekRangeLabel,
  getThisWeekStart,
  normalizeWeekStart,
} from "@/lib/date-range";

export type BoardWeek = {
  weekStart: string;
  loadCount?: number;
  isLocked?: boolean;
  scheduledLockAt?: string | null;
  lockedAt?: string | null;
};

type Props = {
  weekStart: string;
  weeks: BoardWeek[];
  onWeekChange: (weekStart: string) => void;
  onCreateWeek: () => void;
  creatingWeek?: boolean;
  onDeleteWeek?: (weekStart: string) => void | Promise<void>;
  deletingWeek?: boolean;
  formatDate: (d: string | Date) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  canManageWeeks?: boolean;
  canDeleteWeeks?: boolean;
};

export function LoadsWeekToolbar({
  weekStart,
  weeks,
  onWeekChange,
  onCreateWeek,
  creatingWeek = false,
  onDeleteWeek,
  deletingWeek = false,
  formatDate,
  t,
  canManageWeeks = true,
  canDeleteWeeks = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetWeek, setDeleteTargetWeek] = useState<string | null>(null);
  const active = normalizeWeekStart(weekStart);
  const calendarWeekStart = getThisWeekStart();
  const isViewingCurrentWeek = active === calendarWeekStart;

  const weekOptions = useMemo(() => {
    const merged = new Map<string, number>();
    for (const w of weeks) {
      const mon = normalizeWeekStart(w.weekStart);
      merged.set(mon, (merged.get(mon) ?? 0) + (w.loadCount ?? 0));
    }
    if (!merged.has(active)) {
      merged.set(active, 0);
    }
    return [...merged.keys()].sort((a, b) => b.localeCompare(a));
  }, [weeks, active]);

  const loadCountByWeek = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of weeks) {
      const mon = normalizeWeekStart(w.weekStart);
      map.set(mon, (map.get(mon) ?? 0) + (w.loadCount ?? 0));
    }
    return map;
  }, [weeks]);

  const lockedByWeek = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const w of weeks) {
      if (w.isLocked) map.set(normalizeWeekStart(w.weekStart), true);
    }
    return map;
  }, [weeks]);

  const activeWeekLocked = lockedByWeek.get(active) ?? false;

  const nextWeekStart = useMemo(() => {
    const starts = weekOptions.length > 0 ? weekOptions : [getThisWeekStart()];
    const latest = starts.reduce((a, b) => (a > b ? a : b));
    return addDays(normalizeWeekStart(latest), 7);
  }, [weekOptions]);

  const nextWeekLabel = useMemo(
    () => formatWeekRangeLabel(nextWeekStart, formatDate),
    [nextWeekStart, formatDate],
  );

  const navigate = (delta: number) => {
    if (!weekOptions.length) return;
    const idx = weekOptions.indexOf(active);
    const base = idx >= 0 ? idx : 0;
    const next = Math.max(0, Math.min(weekOptions.length - 1, base + delta));
    onWeekChange(weekOptions[next]!);
  };

  const canGoNewer = weekOptions.length > 0 && weekOptions.indexOf(active) > 0;
  const canGoOlder =
    weekOptions.length > 0
    && weekOptions.indexOf(active) >= 0
    && weekOptions.indexOf(active) < weekOptions.length - 1;

  const handleConfirmCreate = () => {
    setConfirmOpen(false);
    onCreateWeek();
  };

  const canDeleteAnyWeek = canDeleteWeeks && weekOptions.length > 1;

  const handleDeleteClick = (ws: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!canDeleteAnyWeek || deletingWeek) return;
    setDeleteTargetWeek(ws);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetWeek || !onDeleteWeek) return;
    try {
      await onDeleteWeek(deleteTargetWeek);
      setDeleteConfirmOpen(false);
      setDeleteTargetWeek(null);
      setOpen(false);
    } catch {
      /* parent shows error toast */
    }
  };

  const deleteTargetLabel = deleteTargetWeek
    ? formatWeekRangeLabel(deleteTargetWeek, formatDate)
    : "";
  const deleteTargetLoadCount = deleteTargetWeek
    ? loadCountByWeek.get(deleteTargetWeek) ?? 0
    : 0;

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="sheet-toolbar-week flex items-center overflow-hidden h-8 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="sheet-toolbar-week-btn h-8 w-8 rounded-none shrink-0"
            disabled={!canGoOlder}
            onClick={() => navigate(1)}
            title={t("loads.weekOlder")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="sheet-toolbar-week-btn h-8 px-2.5 rounded-none text-xs gap-1.5 shrink-0"
                title={formatWeekRangeLabel(active, formatDate)}
              >
                <Calendar className="sheet-toolbar-week-icon h-3.5 w-3.5 shrink-0" />
                {activeWeekLocked && (
                  <Lock className="h-3 w-3 shrink-0 text-red-600 dark:text-red-400" aria-label={t("weekLock.locked")} />
                )}
                <span className="sheet-toolbar-week-label whitespace-nowrap">
                  {formatWeekRangeLabel(active, formatDate)}
                </span>
                {isViewingCurrentWeek && (
                  <span className="sheet-toolbar-badge-active text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0">
                    {t("dashboard.weekActive")}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-1" align="end">
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {t("loads.selectWeek")}
              </p>
              {weekOptions.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">{t("common.noData")}</p>
              ) : (
                weekOptions.map((ws) => {
                  const isSelected = ws === active;
                  const isCurrentCalendarWeek = ws === calendarWeekStart;
                  const isLocked = lockedByWeek.get(ws) ?? false;
                  return (
                    <div
                      key={ws}
                      className={`flex items-center gap-1 rounded-sm hover:bg-muted transition-colors ${
                        isSelected ? "bg-primary/10" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className={`flex-1 min-w-0 text-left px-2 py-2 text-xs ${
                          isSelected ? "text-primary font-semibold" : ""
                        }`}
                        onClick={() => {
                          onWeekChange(ws);
                          setOpen(false);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            {isLocked && <Lock className="h-3 w-3 text-red-600 shrink-0" />}
                            {formatWeekRangeLabel(ws, formatDate)}
                          </span>
                          {isCurrentCalendarWeek && (
                            <span className="sheet-toolbar-badge-active text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0">
                              {t("dashboard.weekActive")}
                            </span>
                          )}
                        </div>
                        <span className="text-muted-foreground">
                          ({t("dashboard.weekLoadsCount", { count: loadCountByWeek.get(ws) ?? 0 })})
                        </span>
                      </button>
                      {canDeleteAnyWeek && onDeleteWeek ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 mr-1 text-muted-foreground hover:text-destructive"
                          title={t("loads.deleteWeek")}
                          disabled={deletingWeek}
                          onClick={(e) => handleDeleteClick(ws, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="sheet-toolbar-week-btn h-8 w-8 rounded-none shrink-0"
            disabled={!canGoNewer}
            onClick={() => navigate(-1)}
            title={t("loads.weekNewer")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        {canManageWeeks && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sheet-toolbar-btn sheet-toolbar-btn--add"
          disabled={creatingWeek}
          onClick={() => setConfirmOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {creatingWeek ? t("loads.creatingWeek") : t("loads.newWeek")}
        </Button>
        )}
      </div>

      {canManageWeeks && (
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">
              {t("loads.newWeekConfirmTitle")}
            </DialogTitle>
            <DialogDescription asChild>
              <p className="text-center pt-3 text-base font-semibold text-foreground">
                {nextWeekLabel}
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-3 sm:justify-center pt-2">
            <Button
              type="button"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              disabled={creatingWeek}
              onClick={handleConfirmCreate}
            >
              {creatingWeek ? t("loads.creatingWeek") : t("loads.newWeekConfirmOpen")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
              disabled={creatingWeek}
              onClick={() => setConfirmOpen(false)}
            >
              {t("loads.newWeekConfirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {canDeleteWeeks && onDeleteWeek ? (
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(next) => {
          if (!deletingWeek) {
            setDeleteConfirmOpen(next);
            if (!next) setDeleteTargetWeek(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">
              {t("loads.deleteWeekConfirmTitle")}
            </DialogTitle>
            <DialogDescription asChild>
              <p className="text-center pt-3 text-sm text-foreground">
                {t("loads.deleteWeekConfirmDescription", {
                  range: deleteTargetLabel,
                  count: deleteTargetLoadCount,
                })}
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-3 sm:justify-center pt-2">
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={deletingWeek || !deleteTargetWeek}
              onClick={handleConfirmDelete}
            >
              {deletingWeek ? t("loads.deletingWeek") : t("loads.deleteWeekConfirmAction")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={deletingWeek}
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeleteTargetWeek(null);
              }}
            >
              {t("loads.deleteWeekCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      ) : null}
    </>
  );
}
