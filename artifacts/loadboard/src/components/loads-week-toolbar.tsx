import { useMemo, useState } from "react";
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
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  addDays,
  formatWeekRangeLabel,
  getThisWeekStart,
  normalizeWeekStart,
} from "@/lib/date-range";

export type BoardWeek = {
  weekStart: string;
  loadCount?: number;
};

type Props = {
  weekStart: string;
  weeks: BoardWeek[];
  onWeekChange: (weekStart: string) => void;
  onCreateWeek: () => void;
  creatingWeek?: boolean;
  formatDate: (d: string | Date) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  canManageWeeks?: boolean;
};

export function LoadsWeekToolbar({
  weekStart,
  weeks,
  onWeekChange,
  onCreateWeek,
  creatingWeek = false,
  formatDate,
  t,
  canManageWeeks = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const active = normalizeWeekStart(weekStart);
  const calendarWeekStart = getThisWeekStart();
  const isViewingCurrentWeek = active === calendarWeekStart;

  const weekOptions = useMemo(() => {
    const merged = new Map<string, number>();
    for (const w of weeks) {
      const mon = normalizeWeekStart(w.weekStart);
      merged.set(mon, (merged.get(mon) ?? 0) + (w.loadCount ?? 0));
    }
    return [...merged.keys()].sort((a, b) => b.localeCompare(a));
  }, [weeks]);

  const loadCountByWeek = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of weeks) {
      const mon = normalizeWeekStart(w.weekStart);
      map.set(mon, (map.get(mon) ?? 0) + (w.loadCount ?? 0));
    }
    return map;
  }, [weeks]);

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

  if (!canManageWeeks) return null;

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center border border-border rounded-md bg-card overflow-hidden h-8 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-7 rounded-none shrink-0"
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
                className="h-8 px-2.5 rounded-none text-xs font-medium gap-1.5 shrink-0"
                title={formatWeekRangeLabel(active, formatDate)}
              >
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="whitespace-nowrap">{formatWeekRangeLabel(active, formatDate)}</span>
                {isViewingCurrentWeek && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-green-800 bg-green-100 px-1 py-0.5 rounded shrink-0">
                    {t("dashboard.weekActive")}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
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
                  return (
                    <button
                      key={ws}
                      type="button"
                      className={`w-full text-left px-2 py-2 rounded-sm text-xs hover:bg-muted transition-colors ${
                        isSelected ? "bg-primary/10 text-primary font-semibold" : ""
                      }`}
                      onClick={() => {
                        onWeekChange(ws);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{formatWeekRangeLabel(ws, formatDate)}</span>
                        {isCurrentCalendarWeek && (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-green-800 bg-green-100 px-1.5 py-0.5 rounded shrink-0">
                            {t("dashboard.weekActive")}
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        ({t("dashboard.weekLoadsCount", { count: loadCountByWeek.get(ws) ?? 0 })})
                      </span>
                    </button>
                  );
                })
              )}
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-7 rounded-none shrink-0"
            disabled={!canGoNewer}
            onClick={() => navigate(-1)}
            title={t("loads.weekNewer")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1 border-border"
          disabled={creatingWeek}
          onClick={() => setConfirmOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {creatingWeek ? t("loads.creatingWeek") : t("loads.newWeek")}
        </Button>
      </div>

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
    </>
  );
}
