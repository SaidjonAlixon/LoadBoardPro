import { CalendarRange, Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  count: number;
  busy: boolean;
  canDelete: boolean;
  canMoveWeek: boolean;
  onDelete: () => void;
  onMoveWeek: () => void;
  onClear: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function LoadsBulkActionBar({
  count,
  busy,
  canDelete,
  canMoveWeek,
  onDelete,
  onMoveWeek,
  onClear,
  t,
}: Props) {
  if (count <= 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={t("loads.sheet.loadsSelected", { count })}
      className={cn(
        "pointer-events-none absolute bottom-2 left-1/2 z-40 -translate-x-1/2",
        "animate-in slide-in-from-bottom-2 fade-in-0 duration-200",
      )}
    >
      <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-2 overflow-hidden rounded-xl border border-primary/20 bg-card/95 py-1.5 pl-2 pr-1.5 shadow-lg shadow-primary/10 backdrop-blur-md dark:border-primary/30 dark:bg-card/90">
        <div className="h-7 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-primary to-accent" />

        <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 px-1.5 text-xs font-bold tabular-nums text-primary dark:bg-accent/15 dark:text-accent">
          {count}
        </span>

        <span className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline">
          {t("loads.sheet.loadsSelected", { count })}
        </span>

        {(canDelete || canMoveWeek) && (
          <div className="mx-0.5 h-5 w-px shrink-0 bg-border/80" />
        )}

        {canDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            title={t("loads.sheet.bulkDelete")}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-red-200/80 bg-red-50 px-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {t("loads.sheet.bulkDelete")}
          </button>
        )}

        {canMoveWeek && (
          <button
            type="button"
            disabled={busy}
            onClick={onMoveWeek}
            title={t("loads.sheet.bulkMoveNextWeek")}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-primary to-accent px-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CalendarRange className="h-3.5 w-3.5" />
            )}
            <span>{t("loads.sheet.bulkMoveShort")}</span>
          </button>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          title={t("common.clear")}
          aria-label={t("common.clear")}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
