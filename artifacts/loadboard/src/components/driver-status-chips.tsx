import { Users, CheckSquare, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DriverChipFilter } from "@/lib/drivers-today";

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
  covered: number;
  ready: number;
  selected: DriverChipFilter | null;
  onSelect: (filter: DriverChipFilter) => void;
  labels: {
    all: string;
    covered: string;
    ready: string;
  };
};

type ChipTone = DriverChipFilter;

function chipToneClass(tone: ChipTone, selected: boolean): string {
  if (tone === "all") {
    return selected
      ? "bg-card border-border text-foreground shadow-sm ring-2 ring-primary/30"
      : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted/60";
  }
  if (tone === "covered") {
    return selected
      ? "bg-[#2E7D32]/15 border-[#2E7D32]/50 text-[#2E7D32] ring-2 ring-[#2E7D32]/25"
      : "bg-muted/40 border-[#2E7D32]/30 text-[#2E7D32] hover:bg-[#2E7D32]/10";
  }
  return selected
    ? "bg-[#C62828]/15 border-[#C62828]/50 text-[#C62828] ring-2 ring-[#C62828]/25"
    : "bg-muted/40 border-[#C62828]/30 text-[#C62828] hover:bg-[#C62828]/10";
}

function iconToneClass(tone: ChipTone): string {
  if (tone === "all") return "text-muted-foreground";
  if (tone === "covered") return "text-[#2E7D32]";
  return "text-[#C62828]";
}

export function DriverStatusChips({
  total,
  covered,
  ready,
  selected,
  onSelect,
  labels,
}: DriverStatusChipsProps) {
  const chips: {
    key: DriverChipFilter;
    label: string;
    count: number;
    tone: ChipTone;
    icon: typeof Users;
  }[] = [
    { key: "all", label: labels.all, count: total, tone: "all", icon: Users },
    { key: "covered", label: labels.covered, count: covered, tone: "covered", icon: CheckSquare },
    { key: "ready", label: labels.ready, count: ready, tone: "ready", icon: AlertCircle },
  ];

  return (
    <div className="flex flex-wrap gap-2" data-testid="kpi-driver-stats">
      {chips.map(({ key, label, count, tone, icon: Icon }) => {
        const isSelected = selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={isSelected}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
              chipToneClass(tone, isSelected),
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", iconToneClass(tone))} />
            <span className="font-semibold uppercase tracking-wide">{label}</span>
            <span className="font-bold tabular-nums">{count}</span>
            <span className="text-xs font-normal opacity-80 tabular-nums">
              {formatShare(count, total)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
