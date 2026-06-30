import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { toast } from "sonner";

type PendingRequest = {
  id: string;
  loadId: string;
  weekStart: string;
  requestedBy: string;
  requesterName: string | null;
  requesterNickname: string | null;
  requesterEmail: string | null;
  loadNumber: string | null;
  originCity: string | null;
  destCity: string | null;
  driverName: string | null;
  brokerName: string | null;
  loadStatus: string | null;
  fieldDescription: string;
  message: string | null;
  createdAt: string;
};

function formatRequesterLabel(r: PendingRequest): string {
  const name = r.requesterName?.trim();
  const nick = r.requesterNickname?.trim();
  if (name && nick) return `${name} (@${nick})`;
  if (name) return name;
  if (nick) return `@${nick}`;
  return r.requesterEmail?.trim() || r.requestedBy;
}

function formatLoadLabel(r: PendingRequest): string {
  const num = r.loadNumber?.trim();
  const from = r.originCity?.trim();
  const to = r.destCity?.trim();
  if (num && (from || to)) {
    return `#${num} — ${from || "?"} → ${to || "?"}`;
  }
  if (num) return `#${num}`;
  return r.loadId.slice(0, 8);
}

type Props = {
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function WeekPendingRequestsButton({ t }: Props) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [minutesByRequest, setMinutesByRequest] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const { data: requests = [], refetch } = useQuery<PendingRequest[]>({
    queryKey: ["/api/week-locks/requests"],
    queryFn: async () => {
      const res = await fetch("/api/week-locks/requests", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const review = async (id: string, action: "approve" | "deny", minutes?: number) => {
    setBusyId(id);
    try {
      const url =
        action === "approve"
          ? `/api/week-locks/requests/${id}/approve`
          : `/api/week-locks/requests/${id}/deny`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body:
          action === "approve"
            ? JSON.stringify({ grantDurationMinutes: minutes ?? 60 })
            : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(
        action === "approve" ? t("weekLock.requestApproved") : t("weekLock.requestDenied"),
      );
      void refetch();
      void qc.invalidateQueries({ queryKey: ["/api/week-locks/grants"] });
      void qc.invalidateQueries({ queryKey: ["/api/week-locks/access"] });
      void qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("weekLock.failed"));
    } finally {
      setBusyId(null);
    }
  };

  const parseMinutes = (id: string, fallback = 60) => {
    const raw = minutesByRequest[id]?.trim() || String(fallback);
    return Math.max(1, Math.min(1440, Math.floor(Number(raw)) || fallback));
  };

  const approveWithMinutes = (id: string) => {
    void review(id, "approve", parseMinutes(id));
  };

  const requestsWithMinutes = requests.filter((r) => {
    const raw = minutesByRequest[r.id]?.trim();
    return raw !== undefined && raw !== "" && Number(raw) >= 1;
  });

  const handleDone = async () => {
    if (requestsWithMinutes.length === 0) {
      setOpen(false);
      return;
    }
    setBusyId("batch");
    try {
      for (const r of requestsWithMinutes) {
        const url = `/api/week-locks/requests/${r.id}/approve`;
        const minutes = parseMinutes(r.id);
        const res = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grantDurationMinutes: minutes }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed");
      }
      toast.success(t("weekLock.requestApproved"));
      void refetch();
      void qc.invalidateQueries({ queryKey: ["/api/week-locks/grants"] });
      void qc.invalidateQueries({ queryKey: ["/api/week-locks/access"] });
      void qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("weekLock.failed"));
    } finally {
      setBusyId(null);
    }
  };

  if (!requests.length) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="sheet-toolbar-btn sheet-toolbar-btn--warn"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-3.5 w-3.5" />
        {t("weekLock.pendingRequests", { count: requests.length })}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("weekLock.pendingTitle")}</DialogTitle>
            <DialogDescription>{t("weekLock.pendingDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {requests.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-3 space-y-2">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t("weekLock.requestDispatcher")}:{" "}
                    <span className="text-primary">{formatRequesterLabel(r)}</span>
                  </p>
                  <p className="text-sm">
                    {t("weekLock.requestLoad")}:{" "}
                    <span className="font-medium text-primary">{formatLoadLabel(r)}</span>
                    {r.driverName && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {t("weekLock.requestDriver")}: {r.driverName}
                      </span>
                    )}
                    {r.brokerName && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {t("weekLock.requestBroker")}: {r.brokerName}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("weekLock.requestWeek")}: {r.weekStart}
                    {r.loadStatus ? ` · ${r.loadStatus}` : ""}
                  </p>
                  <p className="text-xs">
                    <span className="text-muted-foreground">{t("weekLock.requestField")}:</span>{" "}
                    {r.fieldDescription}
                  </p>
                </div>
                {r.message && (
                  <p className="text-xs rounded bg-muted/50 px-2 py-1.5">{r.message}</p>
                )}
                <div className="flex flex-wrap items-end gap-2 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor={`mins-${r.id}`} className="text-[10px] text-muted-foreground">
                      {t("weekLock.grantMinutes")}
                    </Label>
                    <Input
                      id={`mins-${r.id}`}
                      type="number"
                      min={1}
                      max={1440}
                      className="h-8 w-20 bg-background text-foreground"
                      placeholder="5"
                      value={minutesByRequest[r.id] ?? ""}
                      onChange={(e) =>
                        setMinutesByRequest((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={busyId === r.id}
                    onClick={() => approveWithMinutes(r.id)}
                  >
                    {t("weekLock.approveMinutes")}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={busyId === r.id}
                    onClick={() => review(r.id, "approve", 60)}
                  >
                    {t("weekLock.approve1h")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={busyId === r.id}
                    onClick={() => review(r.id, "deny")}
                  >
                    {t("weekLock.deny")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant={requestsWithMinutes.length > 0 ? "default" : "outline"}
              disabled={busyId !== null}
              onClick={() => void handleDone()}
            >
              {requestsWithMinutes.length > 0
                ? t("weekLock.approveAndDone")
                : t("common.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
