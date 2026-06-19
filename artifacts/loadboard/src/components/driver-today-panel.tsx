import type { DriverTodayBlock, DriverChipFilter } from "@/lib/drivers-today";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { useI18n } from "@/lib/i18n";
import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const DRIVER_TYPE_KEYS: Record<string, string> = {
  OO: "drivers.ooShort",
  CD: "drivers.cdShort",
  Lease: "drivers.lease",
};

type DriverTodayPanelProps = {
  filter: DriverChipFilter;
  drivers: DriverTodayBlock[];
  todayDate: string;
  title: string;
};

export function DriverTodayPanel({ filter, drivers, todayDate, title }: DriverTodayPanelProps) {
  const { t, formatDate, formatCurrency, formatNumber } = useI18n();

  const toneBorder =
    filter === "covered"
      ? "border-[#2E7D32]/40"
      : filter === "ready"
        ? "border-[#C62828]/40"
        : "border-border";

  return (
    <div
      className={cn("mt-4 rounded-xl border-2 bg-muted/20 overflow-hidden", toneBorder)}
      data-testid="driver-today-panel"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 border-b border-border bg-muted/30">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">
          {t("dashboard.todayStatusDate", { date: formatDate(todayDate) })}
        </p>
      </div>

      {drivers.length === 0 ? (
        <p className="p-6 text-sm text-center text-muted-foreground">
          {filter === "covered"
            ? t("dashboard.noDriversWithLoadToday")
            : filter === "ready"
              ? t("dashboard.noDriversReadyToday")
              : t("dashboard.noDriversToday")}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {drivers.map((block) => (
            <li key={block.driver.id} className="p-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "rounded-full p-2 shrink-0",
                    block.loads.length > 0 ? "bg-[#2E7D32]/15 text-[#2E7D32]" : "bg-[#C62828]/15 text-[#C62828]",
                  )}
                >
                  <Truck className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="font-semibold text-foreground">{block.driver.fullName}</p>
                    <span className="text-xs text-muted-foreground">
                      {t(DRIVER_TYPE_KEYS[block.driver.driverType] ?? block.driver.driverType)}
                      {block.driver.truckNumber ? ` • #${block.driver.truckNumber}` : ""}
                    </span>
                    {block.loads.length > 0 ? (
                      <span className="text-xs font-semibold uppercase text-[#2E7D32]">
                        {t("dashboard.driversOnLoad")}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold uppercase text-[#C62828]">
                        {t("dashboard.driversEmpty")}
                      </span>
                    )}
                  </div>

                  {block.loads.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {block.loads.map((load) => (
                        <div
                          key={load.id}
                          className="rounded-lg border border-border bg-card/80 px-3 py-2 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-bold text-foreground">{load.loadNumber}</span>
                            <LoadStatusBadge status={load.status} />
                            <span className="text-muted-foreground">
                              {load.originCity}, {load.originState} → {load.destCity}, {load.destState}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {t("dashboard.puDate")}: {formatDate(load.puDate)}
                            </span>
                            <span>
                              {t("loads.sheet.delDate")}: {formatDate(load.delDate)}
                            </span>
                            <span>
                              {t("loads.sheet.mileage")}: {formatNumber(load.mileage)}
                            </span>
                            <span>
                              {t("dashboard.rate")}: {formatCurrency(load.rate)}
                            </span>
                            {load.broker?.name && (
                              <span>
                                {t("loads.broker")}: {load.broker.name}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">{t("dashboard.driverNoLoadToday")}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
