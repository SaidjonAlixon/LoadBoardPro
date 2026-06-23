import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DriverChipFilter } from "@/lib/drivers-today";
import {
  DRIVER_BOARD_STATUSES,
  DRIVER_BOARD_STATUS_COLORS,
  DRIVER_BOARD_STATUS_I18N,
  type DriverBoardStatus,
} from "@/lib/driver-board-status";

/** ALL + this many status chips on row 1; the rest share row 2 with filters. */
const FIRST_ROW_STATUS_COUNT = 5;

function formatShare(count: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (count / total) * 100;
  if (pct >= 100) return "100%";
  if (pct < 1) return `${pct.toFixed(2)}%`;
  if (pct < 10) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(1)}%`;
}

type DriverStatusChipsProps = {
  total: number;
  statusCounts: Record<DriverBoardStatus, number>;
  selected: DriverChipFilter;
  onSelect: (filter: DriverChipFilter) => void;
  allLabel: string;
  statusLabel: (key: string) => string;
  trailing?: React.ReactNode;
};

function chipClass(
  colors: { bg: string; text: string; border: string },
  selected: boolean,
): string {
  if (selected) {
    return cn("ring-2 shadow-sm");
  }
  return "opacity-90 hover:opacity-100";
}

export function DriverStatusChips({
  total,
  statusCounts,
  selected,
  onSelect,
  allLabel,
  statusLabel,
  trailing,
}: DriverStatusChipsProps) {
  const row1Statuses = DRIVER_BOARD_STATUSES.slice(0, FIRST_ROW_STATUS_COUNT);
  const row2Statuses = DRIVER_BOARD_STATUSES.slice(FIRST_ROW_STATUS_COUNT);

  const renderStatusChip = (status: DriverBoardStatus) => {
    const count = statusCounts[status] ?? 0;
    const colors = DRIVER_BOARD_STATUS_COLORS[status];
    const isSelected = selected === status;
    return (
      <button
        key={status}
        type="button"
        onClick={() => onSelect(status)}
        aria-pressed={isSelected}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
          chipClass(colors, isSelected),
        )}
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          borderColor: colors.border,
          ...(isSelected ? { boxShadow: `0 0 0 2px ${colors.border}` } : {}),
        }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full border"
          style={{ backgroundColor: colors.text, borderColor: colors.border }}
        />
        <span className="font-semibold uppercase tracking-wide whitespace-nowrap">
          {statusLabel(DRIVER_BOARD_STATUS_I18N[status])}
        </span>
        <span className="font-bold tabular-nums">{count}</span>
        <span className="text-xs font-normal opacity-80 tabular-nums">
          {formatShare(count, total)}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2" data-testid="kpi-driver-stats">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => onSelect("all")}
          aria-pressed={selected === "all"}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
            selected === "all"
              ? "bg-card border-border text-foreground shadow-sm ring-2 ring-primary/30"
              : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted/60",
          )}
        >
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-semibold uppercase tracking-wide whitespace-nowrap">{allLabel}</span>
          <span className="font-bold tabular-nums">{total}</span>
          <span className="text-xs font-normal opacity-80 tabular-nums">100%</span>
        </button>
        {row1Statuses.map(renderStatusChip)}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap flex-1 min-w-0">
          {row2Statuses.map(renderStatusChip)}
        </div>
        {trailing ? (
          <div className="flex shrink-0 items-center justify-end sm:ml-auto">{trailing}</div>
        ) : null}
      </div>
    </div>
  );
}
