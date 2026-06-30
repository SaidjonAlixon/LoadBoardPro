import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeekGrantCountdown } from "@/components/week-grant-countdown";
import { toast } from "sonner";

export type WeekEditGrantRow = {
  id: string;
  userId: string;
  userName: string;
  expiresAt: string;
};

type Props = {
  weekStart: string;
  isLocked: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onChanged: () => void;
};

export function WeekActiveGrants({ weekStart, isLocked, t, onChanged }: Props) {
  const qc = useQueryClient();

  const { data: grants = [] } = useQuery<WeekEditGrantRow[]>({
    queryKey: ["/api/week-locks/grants", weekStart],
    enabled: isLocked,
    queryFn: async () => {
      const res = await fetch(
        `/api/week-locks/grants?weekStart=${encodeURIComponent(weekStart)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (!rows?.length) return false;
      const soonest = rows
        .map((g) => new Date(g.expiresAt).getTime())
        .sort((a, b) => a - b)[0];
      if (soonest === undefined) return false;
      const remaining = soonest - Date.now();
      if (remaining <= 0) return 3_000;
      return 5_000;
    },
  });

  const revoke = async (grantId: string) => {
    try {
      const res = await fetch("/api/week-locks/grants/revoke", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("weekLock.failed"));
      toast.success(t("weekLock.grantRevoked"));
      void qc.invalidateQueries({ queryKey: ["/api/week-locks/grants", weekStart] });
      void qc.invalidateQueries({ queryKey: ["/api/week-locks/access"] });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("weekLock.failed"));
    }
  };

  if (!isLocked || !grants.length) return null;

  return (
    <div className="flex flex-col gap-1 min-w-0 max-w-[280px]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        {t("weekLock.activeGrants", { count: grants.length })}
      </p>
      <ul className="space-y-0.5">
        {grants.map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-1.5 rounded border border-emerald-200/80 bg-emerald-50/80 px-1.5 py-0.5 text-[10px] text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{g.userName}</span>
            <WeekGrantCountdown expiresAt={g.expiresAt} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 text-emerald-800 hover:text-destructive dark:text-emerald-200"
              title={t("weekLock.revokeGrant")}
              onClick={() => void revoke(g.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
