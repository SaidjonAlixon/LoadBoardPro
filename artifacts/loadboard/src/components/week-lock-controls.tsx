import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Lock, LockOpen, Clock, Users } from "lucide-react";
import { datetimeLocalToIso, toDatetimeLocalValue } from "@/lib/scheduled-datetime";
import { APP_TIMEZONE, formatInEt } from "@/lib/date-range";
import { toast } from "sonner";
import { WeekGrantDialog } from "@/components/week-grant-dialog";
import { WeekActiveGrants } from "@/components/week-active-grants";
import type { User } from "@workspace/api-client-react";

type Props = {
  weekStart: string;
  isLocked: boolean;
  scheduledLockAt: string | null;
  autoLockOnWeekRollover: boolean;
  dispatchers: User[];
  t: (key: string, vars?: Record<string, string | number>) => string;
  onChanged: () => void;
};

async function apiJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function WeekLockControls({
  weekStart,
  isLocked,
  scheduledLockAt,
  autoLockOnWeekRollover,
  dispatchers,
  t,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => {
    const d = new Date();
    d.setTime(d.getTime() + 60 * 60 * 1000);
    return toDatetimeLocalValue(d.toISOString());
  });
  const [autoRollover, setAutoRollover] = useState(autoLockOnWeekRollover);

  const { data: activeGrants = [] } = useQuery<{ id: string }[]>({
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
    refetchInterval: 5_000,
  });

  const toggleLock = async () => {
    setBusy(true);
    try {
      if (isLocked) {
        await apiJson("/api/week-locks/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekStart }),
        });
        toast.success(t("weekLock.unlocked"));
      } else {
        await apiJson("/api/week-locks/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekStart }),
        });
        toast.success(t("weekLock.locked"));
      }
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("weekLock.failed"));
    } finally {
      setBusy(false);
    }
  };

  const saveSchedule = async () => {
    setBusy(true);
    try {
      const data = (await apiJson("/api/week-locks/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, scheduledLockAt: datetimeLocalToIso(scheduleAt) }),
      })) as { isLocked?: boolean };
      toast.success(data.isLocked ? t("weekLock.locked") : t("weekLock.scheduleSaved"));
      setScheduleOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("weekLock.failed"));
    } finally {
      setBusy(false);
    }
  };

  const clearSchedule = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/week-locks/schedule?weekStart=${encodeURIComponent(weekStart)}`, {
        method: "DELETE",
      });
      toast.success(t("weekLock.scheduleCleared"));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("weekLock.failed"));
    } finally {
      setBusy(false);
    }
  };

  const saveAutoRollover = async (next: boolean) => {
    setAutoRollover(next);
    try {
      await apiJson("/api/week-locks/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoLockOnWeekRollover: next }),
      });
      toast.success(t("weekLock.settingsSaved"));
      onChanged();
    } catch (e) {
      setAutoRollover(!next);
      toast.error(e instanceof Error ? e.message : t("weekLock.failed"));
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`sheet-toolbar-btn ${isLocked ? "sheet-toolbar-btn--danger" : "sheet-toolbar-btn--lock"}`}
            disabled={busy}
            onClick={toggleLock}
            title={isLocked ? t("weekLock.unlockWeek") : t("weekLock.lockWeek")}
          >
            {isLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            {isLocked ? t("weekLock.unlock") : t("weekLock.lock")}
            {isLocked && activeGrants.length > 0 && (
              <span className="ml-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                {activeGrants.length}
              </span>
            )}
          </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sheet-toolbar-btn sheet-toolbar-btn--schedule"
          disabled={busy || isLocked}
          onClick={() => setScheduleOpen(true)}
          title={t("weekLock.scheduleLock")}
        >
          <Clock className="h-3.5 w-3.5" />
          {t("weekLock.schedule")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sheet-toolbar-btn sheet-toolbar-btn--grant"
          disabled={busy || !isLocked}
          onClick={() => setGrantOpen(true)}
          title={t("weekLock.grantAccess")}
        >
          <Users className="h-3.5 w-3.5" />
          {t("weekLock.grant")}
          {activeGrants.length > 0 && (
            <span className="ml-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
              {activeGrants.length}
            </span>
          )}
        </Button>
        </div>

        <WeekActiveGrants
          weekStart={weekStart}
          isLocked={isLocked}
          t={t}
          onChanged={onChanged}
        />
      </div>

      {scheduledLockAt && !isLocked && (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden xl:inline">
          {t("weekLock.scheduledAt", {
            time: formatInEt(scheduledLockAt, "en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }),
          })}
          <button
            type="button"
            className="ml-1 underline hover:text-foreground"
            onClick={clearSchedule}
            disabled={busy}
          >
            {t("weekLock.clearSchedule")}
          </button>
        </span>
      )}

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("weekLock.scheduleTitle")}</DialogTitle>
            <DialogDescription>{t("weekLock.scheduleDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="schedule-at">{t("weekLock.scheduleDateTime")}</Label>
            <Input
              id="schedule-at"
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">{t("weekLock.autoRollover")}</p>
              <p className="text-xs text-muted-foreground">{t("weekLock.autoRolloverDesc")}</p>
            </div>
            <Switch checked={autoRollover} onCheckedChange={saveAutoRollover} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy} onClick={saveSchedule}>
              {t("weekLock.saveSchedule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WeekGrantDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        weekStart={weekStart}
        dispatchers={dispatchers}
        t={t}
        onGranted={onChanged}
      />
    </>
  );
}
