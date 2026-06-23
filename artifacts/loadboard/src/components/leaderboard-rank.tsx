import { Medal, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const TOP_RANKS: Record<
  1 | 2 | 3,
  { Icon: typeof Trophy; badge: string; icon: string }
> = {
  1: {
    Icon: Trophy,
    badge:
      "bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 ring-amber-300/60 shadow-md shadow-amber-500/30",
    icon: "text-white",
  },
  2: {
    Icon: Medal,
    badge:
      "bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500 ring-slate-300/70 shadow-md shadow-slate-400/25",
    icon: "text-white",
  },
  3: {
    Icon: Medal,
    badge:
      "bg-gradient-to-br from-orange-400 via-amber-700 to-orange-800 ring-orange-300/60 shadow-md shadow-orange-700/25",
    icon: "text-white",
  },
};

type LeaderboardRankProps = {
  rank: number;
};

export function LeaderboardRank({ rank }: LeaderboardRankProps) {
  const top = TOP_RANKS[rank as 1 | 2 | 3];
  if (top) {
    const { Icon, badge, icon } = top;
    return (
      <span
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full ring-2",
          badge,
        )}
        aria-label={`Rank ${rank}`}
      >
        <Icon className={cn("h-[18px] w-[18px]", icon)} strokeWidth={2.25} />
      </span>
    );
  }

  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-sm font-bold text-muted-foreground tabular-nums ring-1 ring-border"
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}
