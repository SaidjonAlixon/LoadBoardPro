import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { User } from "@workspace/api-client-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  dispatchers: User[];
  t: (key: string, vars?: Record<string, string | number>) => string;
  onGranted: () => void;
};

export function WeekGrantDialog({
  open,
  onOpenChange,
  weekStart,
  dispatchers,
  t,
  onGranted,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [durationHours, setDurationHours] = useState("1");
  const [allDispatchers, setAllDispatchers] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleDispatcher = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGrant = async () => {
    const userIds = allDispatchers
      ? dispatchers.map((d) => d.id)
      : [...selected];
    if (!userIds.length) {
      toast.error(t("weekLock.pickDispatchers"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/week-locks/grants", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          userIds,
          durationHours: Number(durationHours),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(t("weekLock.grantSuccess"));
      onOpenChange(false);
      onGranted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("weekLock.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("weekLock.grantTitle")}</DialogTitle>
          <DialogDescription>{t("weekLock.grantDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("weekLock.grantDuration")}</Label>
            <Select value={durationHours} onValueChange={setDurationHours}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("weekLock.hours1")}</SelectItem>
                <SelectItem value="3">{t("weekLock.hours3")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="all-dispatchers"
              checked={allDispatchers}
              onCheckedChange={(v) => setAllDispatchers(v === true)}
            />
            <Label htmlFor="all-dispatchers">{t("weekLock.allDispatchers")}</Label>
          </div>

          {!allDispatchers && (
            <div className="max-h-48 overflow-y-auto space-y-2 rounded-md border border-border p-2">
              {dispatchers.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selected.has(d.id)}
                    onCheckedChange={() => toggleDispatcher(d.id)}
                  />
                  <span>{d.fullName ?? d.email}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy} onClick={handleGrant}>
            {t("weekLock.grantConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
