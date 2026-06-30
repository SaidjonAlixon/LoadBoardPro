import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Load } from "@workspace/api-client-react";

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

  useEffect(() => {
    if (!open) {
      setLoadId("");
      setFieldDescription("");
      setMessage("");
    }
  }, [open]);

  useEffect(() => {
    if (loadId && !loads.some((l) => l.id === loadId)) {
      setLoadId("");
    }
  }, [loads, loadId]);

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
            <Select value={loadId || undefined} onValueChange={setLoadId} disabled={!loads.length}>
              <SelectTrigger id="req-load" className="bg-background">
                <SelectValue
                  placeholder={
                    loads.length
                      ? t("weekLock.requestPickLoad")
                      : t("weekLock.requestNoOwnLoads")
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[min(19.5rem,var(--radix-select-content-available-height))]">
                {loads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    #{l.loadNumber} — {l.originCity ?? "?"} → {l.destCity ?? "?"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loads.length && (
              <p className="text-xs text-muted-foreground">{t("weekLock.requestNoOwnLoads")}</p>
            )}
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
