import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [allDispatchers, setAllDispatchers] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setSearch("");
      setAllDispatchers(true);
      setSelected(new Set());
    }
  }, [open]);

  const filteredDispatchers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dispatchers;
    return dispatchers.filter((d) => {
      const name = (d.fullName ?? "").toLowerCase();
      const email = (d.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [dispatchers, search]);

  const dispatcherLabel = (d: User) => d.fullName?.trim() || d.email || d.id;

  const toggleDispatcher = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGrant = async () => {
    const userIds = allDispatchers ? dispatchers.map((d) => d.id) : [...selected];
    if (!userIds.length) {
      toast.error(t("weekLock.pickDispatchers"));
      return;
    }
    const minutes = Math.max(1, Math.min(1440, Math.floor(Number(durationMinutes)) || 60));
    setBusy(true);
    try {
      const res = await fetch("/api/week-locks/grants", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          userIds,
          durationMinutes: minutes,
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
            <Label htmlFor="grant-minutes">{t("weekLock.grantMinutes")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="grant-minutes"
                type="number"
                min={1}
                max={1440}
                className="h-9 w-24 bg-background"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setDurationMinutes("5")}>
                5m
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDurationMinutes("60")}>
                {t("weekLock.hours1")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDurationMinutes("180")}>
                {t("weekLock.hours3")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 shrink-0">
                <Checkbox
                  id="all-dispatchers"
                  checked={allDispatchers}
                  onCheckedChange={(v) => setAllDispatchers(v === true)}
                />
                <Label htmlFor="all-dispatchers">{t("weekLock.allDispatchers")}</Label>
              </div>
              {!allDispatchers && (
                <Input
                  type="search"
                  className="h-8 bg-background text-sm sm:max-w-[220px]"
                  placeholder={t("weekLock.searchDispatcher")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
            </div>

            {!allDispatchers && (
              <div className="max-h-[19.5rem] overflow-y-auto rounded-md border border-border p-2 space-y-1">
                {filteredDispatchers.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    {t("weekLock.noDispatchersFound")}
                  </p>
                ) : (
                  filteredDispatchers.map((d) => (
                    <label
                      key={d.id}
                      className="flex min-h-7 items-center gap-2 rounded px-1 py-0.5 text-sm cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.has(d.id)}
                        onCheckedChange={() => toggleDispatcher(d.id)}
                      />
                      <span className="min-w-0 truncate font-medium">{dispatcherLabel(d)}</span>
                      {d.fullName?.trim() && d.email ? (
                        <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">
                          {d.email}
                        </span>
                      ) : null}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
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
