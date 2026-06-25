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
import { Bell } from "lucide-react";
import { toast } from "sonner";

type PendingRequest = {
  id: string;
  loadId: string;
  weekStart: string;
  requestedBy: string;
  fieldDescription: string;
  message: string | null;
  createdAt: string;
};

type Props = {
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function WeekPendingRequestsButton({ t }: Props) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const review = async (id: string, action: "approve" | "deny", hours?: number) => {
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
        body: action === "approve" ? JSON.stringify({ grantDurationHours: hours }) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(
        action === "approve" ? t("weekLock.requestApproved") : t("weekLock.requestDenied"),
      );
      void refetch();
      void qc.invalidateQueries({ queryKey: ["/api/notifications"] });
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
                <p className="text-sm font-medium">{r.fieldDescription}</p>
                <p className="text-xs text-muted-foreground">
                  {t("weekLock.requestWeek")}: {r.weekStart} · Load {r.loadId.slice(0, 8)}…
                </p>
                {r.message && <p className="text-xs">{r.message}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busyId === r.id}
                    onClick={() => review(r.id, "approve", 1)}
                  >
                    {t("weekLock.approve1h")}
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busyId === r.id}
                    onClick={() => review(r.id, "approve", 3)}
                  >
                    {t("weekLock.approve3h")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
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
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
