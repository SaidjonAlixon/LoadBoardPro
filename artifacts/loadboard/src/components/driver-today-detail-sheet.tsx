import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DriverTodayBlock } from "@/lib/drivers-today";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { useI18n } from "@/lib/i18n";
import { translateLoadStatus } from "@/lib/i18n/translate";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StateLocationInput } from "@/components/state-location-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { toast } from "sonner";
import { Truck, MapPin, User, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const DRIVER_TYPE_KEYS: Record<string, string> = {
  OO: "drivers.ooShort",
  CD: "drivers.cdShort",
  Lease: "drivers.lease",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

type DriverTodayDetailSheetProps = {
  block: DriverTodayBlock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DriverTodayDetailSheet({ block, open, onOpenChange }: DriverTodayDetailSheetProps) {
  const { t, formatDate, formatCurrency, formatNumber } = useI18n();
  const qc = useQueryClient();
  const [location, setLocation] = useState("");

  useEffect(() => {
    setLocation(block?.driver.currentLocation ?? "");
  }, [block?.driver.id, block?.driver.currentLocation, open]);

  const saveLocation = useMutation({
    mutationFn: async ({ driverId, currentLocation }: { driverId: string; currentLocation: string }) => {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentLocation: currentLocation.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Failed to save location");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setLocation(data.currentLocation ?? "");
      void qc.invalidateQueries({ queryKey: ["/api/analytics/drivers-today"] });
      void qc.invalidateQueries({ queryKey: ["/api/drivers"] });
      toast.success(t("dashboard.locationSaved"));
    },
    onError: (err: Error) => toast.error(err.message || t("dashboard.locationSaveFailed")),
  });

  if (!block) return null;

  const isCovered = block.loads.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left pb-4 border-b border-border">
          <div className="flex items-start gap-3 pr-8">
            <div
              className={cn(
                "rounded-full p-2.5 shrink-0",
                isCovered ? "bg-[#2E7D32]/15 text-[#2E7D32]" : "bg-[#C62828]/15 text-[#C62828]",
              )}
            >
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-xl">{block.driver.fullName}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t(DRIVER_TYPE_KEYS[block.driver.driverType] ?? block.driver.driverType)}
                {block.driver.truckNumber ? ` • #${block.driver.truckNumber}` : ""}
              </p>
              <span
                className={cn(
                  "inline-block mt-2 text-xs font-semibold uppercase",
                  isCovered ? "text-[#2E7D32]" : "text-[#C62828]",
                )}
              >
                {isCovered ? t("dashboard.driversOnLoad") : t("dashboard.driversEmpty")}
              </span>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-accent" />
                {t("dashboard.currentLocation")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <StateLocationInput
                value={location}
                onChange={setLocation}
                placeholder={t("dashboard.currentLocationPh")}
              />
              <Button
                size="sm"
                className="w-full sm:w-auto"
                disabled={saveLocation.isPending}
                onClick={() =>
                  saveLocation.mutate({
                    driverId: block.driver.id,
                    currentLocation: location,
                  })
                }
              >
                {saveLocation.isPending ? t("common.saving") : t("dashboard.saveLocation")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-accent" />
                {t("dashboard.driverInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <DetailRow
                label={t("drivers.phone")}
                value={
                  block.driver.phone ? (
                    <a href={`tel:${block.driver.phone}`} className="text-accent hover:underline">
                      {block.driver.phone}
                    </a>
                  ) : (
                    t("common.emDash")
                  )
                }
              />
              <DetailRow
                label={t("drivers.email")}
                value={
                  block.driver.email ? (
                    <a href={`mailto:${block.driver.email}`} className="text-accent hover:underline break-all">
                      {block.driver.email}
                    </a>
                  ) : (
                    t("common.emDash")
                  )
                }
              />
              <DetailRow
                label={t("drivers.truckNumber")}
                value={block.driver.truckNumber ?? t("common.emDash")}
              />
              <DetailRow
                label={t("dashboard.status")}
                value={block.driver.isActive ? t("status.active") : t("status.inactive")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm">{t("dashboard.todaysLoads")}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {block.loads.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("dashboard.driverNoLoadToday")}</p>
              ) : (
                block.loads.map((load) => (
                  <div key={load.id} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{load.loadNumber}</span>
                        <LoadStatusBadge status={load.status} />
                      </div>
                      <Link href={`/loads/${load.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 text-accent gap-1">
                          {t("dashboard.viewLoadDetails")}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">{t("loadDetail.pickup")}</p>
                          <p className="font-medium">
                            {load.originCity}, {load.originState}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDate(load.puDate)}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">{t("loadDetail.delivery")}</p>
                          <p className="font-medium">
                            {load.destCity}, {load.destState}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {load.delDate ? formatDate(load.delDate) : t("common.emDash")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-0">
                      <DetailRow label={t("loads.sheet.mileage")} value={formatNumber(load.mileage ?? 0)} />
                      <DetailRow
                        label={t("loads.sheet.rpm")}
                        value={load.rpm != null ? formatCurrency(load.rpm) : t("common.emDash")}
                      />
                      <DetailRow label={t("dashboard.rate")} value={formatCurrency(load.rate ?? 0)} />
                      <DetailRow
                        label={t("loads.sheet.reimbursement")}
                        value={formatCurrency(load.reimbursement ?? 0)}
                      />
                      {load.dispatcher && (
                        <DetailRow
                          label={t("dashboard.dispatcher")}
                          value={load.dispatcher.name ?? load.dispatcher.email ?? t("common.emDash")}
                        />
                      )}
                      {load.broker && (
                        <DetailRow label={t("loads.broker")} value={load.broker.name} />
                      )}
                      <DetailRow
                        label={t("loads.sheet.status")}
                        value={translateLoadStatus(t, load.status)}
                      />
                    </div>

                    {load.dispatchNotes && (
                      <div className="text-sm">
                        <Label className="text-muted-foreground text-xs">{t("loads.sheet.dispatchNotes")}</Label>
                        <p className="mt-1 text-foreground whitespace-pre-wrap">{load.dispatchNotes}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {block.loads.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">{t("dashboard.gross")}</p>
                <p className="font-bold text-foreground">{formatCurrency(block.totalGross)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("loads.sheet.mileage")}</p>
                <p className="font-bold text-foreground">{formatNumber(block.totalMiles)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("loads.sheet.reimbursement")}</p>
                <p className="font-bold text-foreground">{formatCurrency(block.totalReimbursement ?? 0)}</p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
