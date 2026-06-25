import { useMemo, useState } from "react";
import type { BoardWeek } from "@/components/loads-week-toolbar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatWeekRangeLabel,
  getThisWeekStart,
  normalizeWeekStart,
} from "@/lib/date-range";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weeks: BoardWeek[];
  currentWeekStart: string;
  count: number;
  busy?: boolean;
  formatDate: (d: string | Date) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onConfirm: (targetWeekStart: string) => void;
};

export function LoadsBulkMoveWeekDialog({
  open,
  onOpenChange,
  weeks,
  currentWeekStart,
  count,
  busy = false,
  formatDate,
  t,
  onConfirm,
}: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const active = normalizeWeekStart(currentWeekStart);
  const calendarWeekStart = getThisWeekStart();

  const weekOptions = useMemo(() => {
    const merged = new Map<string, number>();
    for (const w of weeks) {
      const mon = normalizeWeekStart(w.weekStart);
      merged.set(mon, (merged.get(mon) ?? 0) + (w.loadCount ?? 0));
    }
    if (!merged.has(active)) merged.set(active, 0);
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

  const handleOpenChange = (next: boolean) => {
    if (!next) setPicked(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("loads.sheet.bulkMovePickWeekTitle")}</DialogTitle>
          <DialogDescription>
            {t("loads.sheet.bulkMovePickWeekDesc", { count })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(50vh,320px)] overflow-y-auto rounded-lg border border-border/70 divide-y divide-border/50">
          {weekOptions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("loads.noWeeks")}
            </p>
          ) : (
            weekOptions.map((ws) => {
              const isCurrent = ws === active;
              const isSelected = picked === ws;
              const isCalendarWeek = ws === calendarWeekStart;
              return (
                <button
                  key={ws}
                  type="button"
                  disabled={busy}
                  onClick={() => setPicked(ws)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                    isSelected && "bg-primary/8 hover:bg-primary/10",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70 bg-muted/30 text-muted-foreground",
                    )}
                  >
                    {isSelected ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Calendar className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {formatWeekRangeLabel(ws, formatDate)}
                      </span>
                      {isCalendarWeek && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                          {t("dashboard.weekActive")}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">
                          {t("loads.sheet.bulkMoveCurrentWeek")}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t("dashboard.weekLoadsCount", {
                        count: loadCountByWeek.get(ws) ?? 0,
                      })}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => handleOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!picked || busy}
            onClick={() => {
              if (!picked) return;
              onConfirm(picked);
            }}
          >
            {t("loads.sheet.bulkMoveConfirmBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
