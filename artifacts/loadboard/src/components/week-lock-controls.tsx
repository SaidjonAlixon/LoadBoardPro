import { useState } from "react";
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
import { toast } from "sonner";
import { WeekGrantDialog } from "@/components/week-grant-dialog";
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
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [autoRollover, setAutoRollover] = useState(autoLockOnWeekRollover);

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
      await apiJson("/api/week-locks/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, scheduledLockAt: new Date(scheduleAt).toISOString() }),
      });
      toast.success(t("weekLock.scheduleSaved"));
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
      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          variant={isLocked ? "destructive" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={busy}
          onClick={toggleLock}
          title={isLocked ? t("weekLock.unlockWeek") : t("weekLock.lockWeek")}
        >
          {isLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
          {isLocked ? t("weekLock.unlock") : t("weekLock.lock")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
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
          className="h-8 text-xs gap-1"
          disabled={busy || !isLocked}
          onClick={() => setGrantOpen(true)}
          title={t("weekLock.grantAccess")}
        >
          <Users className="h-3.5 w-3.5" />
          {t("weekLock.grant")}
        </Button>
      </div>

      {scheduledLockAt && !isLocked && (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden xl:inline">
          {t("weekLock.scheduledAt", {
            time: new Date(scheduledLockAt).toLocaleString(),
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
