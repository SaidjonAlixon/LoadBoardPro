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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Load, User } from "@workspace/api-client-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  loads: Load[];
  t: (key: string, vars?: Record<string, string | number>) => string;
  onSubmitted: () => void;
};

export function WeekPermissionRequestDialog({
  open,
  onOpenChange,
  weekStart,
  loads,
  t,
  onSubmitted,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [loadId, setLoadId] = useState("");
  const [fieldDescription, setFieldDescription] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!loadId || !fieldDescription.trim()) {
      toast.error(t("weekLock.requestFillRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/week-locks/requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadId,
          weekStart,
          fieldDescription: fieldDescription.trim(),
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(t("weekLock.requestSent"));
      setLoadId("");
      setFieldDescription("");
      setMessage("");
      onOpenChange(false);
      onSubmitted();
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
          <DialogTitle>{t("weekLock.requestTitle")}</DialogTitle>
          <DialogDescription>{t("weekLock.requestDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="req-load">{t("weekLock.requestLoad")}</Label>
            <select
              id="req-load"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={loadId}
              onChange={(e) => setLoadId(e.target.value)}
            >
              <option value="">{t("weekLock.requestPickLoad")}</option>
              {loads.map((l) => (
                <option key={l.id} value={l.id}>
                  #{l.loadNumber} — {l.originCity ?? "?"} → {l.destCity ?? "?"}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="req-field">{t("weekLock.requestField")}</Label>
            <Input
              id="req-field"
              value={fieldDescription}
              onChange={(e) => setFieldDescription(e.target.value)}
              placeholder={t("weekLock.requestFieldPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="req-msg">{t("weekLock.requestMessage")}</Label>
            <Textarea
              id="req-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy} onClick={handleSubmit}>
            {t("weekLock.requestSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
