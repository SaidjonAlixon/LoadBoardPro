import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { invalidateDriverQueries } from "@/lib/invalidate-driver-queries";

const EMPTY_DRIVER = {
  fullName: "",
  driverType: "CD" as const,
  phone: "",
  email: "",
  truckNumber: "",
};

type DriverQuickForm = {
  fullName: string;
  driverType: "OO" | "CD" | "Lease";
  phone: string;
  email: string;
  truckNumber: string;
};

export function QuickAddDriverDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (driverId: string) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<DriverQuickForm>(EMPTY_DRIVER);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) setForm(EMPTY_DRIVER);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (data: DriverQuickForm) => {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("drivers.saveFailed"));
      }
      return res.json();
    },
    onSuccess: (driver: { id: string }) => {
      void invalidateDriverQueries(qc);
      onCreated(driver.id);
      onClose();
    },
  });

  const set =
    (k: keyof DriverQuickForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("drivers.addDriver")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="quickDriverName">
              {t("drivers.fullName")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="quickDriverName"
              value={form.fullName}
              onChange={set("fullName")}
              required
              placeholder={t("drivers.fullNamePh")}
              className="border-border focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("drivers.driverType")}</Label>
            <Select
              value={form.driverType}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, driverType: v as DriverQuickForm["driverType"] }))
              }
            >
              <SelectTrigger className="border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OO">{t("drivers.oo")}</SelectItem>
                <SelectItem value="CD">{t("drivers.cd")}</SelectItem>
                <SelectItem value="Lease">{t("drivers.lease")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quickDriverPhone">{t("drivers.phone")}</Label>
              <Input
                id="quickDriverPhone"
                value={form.phone}
                onChange={set("phone")}
                placeholder={t("drivers.phonePh")}
                className="border-border focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickDriverTruck">{t("drivers.truckNumber")}</Label>
              <Input
                id="quickDriverTruck"
                value={form.truckNumber}
                onChange={set("truckNumber")}
                placeholder={t("drivers.truckPh")}
                className="border-border focus:border-primary"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quickDriverEmail">{t("drivers.email")}</Label>
            <Input
              id="quickDriverEmail"
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder={t("drivers.emailPh")}
              className="border-border focus:border-primary"
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-red-600">{(mutation.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t("common.saving") : t("drivers.addDriver")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
