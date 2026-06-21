import { useState } from "react";
import type { DriverTodayBlock, DriverChipFilter } from "@/lib/drivers-today";
import { sortDriversTodayBlocks } from "@/lib/drivers-today";
import { DriverTodayDetailSheet } from "@/components/driver-today-detail-sheet";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { useI18n } from "@/lib/i18n";
import { Truck, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function cityState(city: string, state: string): string {
  if (city === "-") return "";
  return state ? `${city}, ${state}` : city;
}

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
  const [selected, setSelected] = useState<DriverTodayBlock | null>(null);
  const sortedDrivers = sortDriversTodayBlocks(drivers);

  const toneBorder =
    filter === "covered"
      ? "border-[#2E7D32]/40"
      : filter === "ready"
        ? "border-[#C62828]/40"
        : "border-border";

  return (
    <>
      <div
        className={cn("mt-4 rounded-xl border-2 bg-muted/20 overflow-hidden", toneBorder)}
        data-testid="driver-today-panel"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.clickDriverForDetails")}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.todayStatusDate", { date: formatDate(todayDate) })}
          </p>
        </div>

        {sortedDrivers.length === 0 ? (
          <p className="p-6 text-sm text-center text-muted-foreground">
            {filter === "covered"
              ? t("dashboard.noDriversWithLoadToday")
              : filter === "ready"
                ? t("dashboard.noDriversReadyToday")
                : t("dashboard.noDriversToday")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sortedDrivers.map((block) => {
              const isCovered = block.loads.length > 0;
              return (
                <li key={block.driver.id}>
                  <div className="p-4">
                    <button
                      type="button"
                      onClick={() => setSelected(block)}
                      className="w-full flex items-center gap-3 text-left hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div
                        className={cn(
                          "rounded-full p-2 shrink-0",
                          isCovered ? "bg-[#2E7D32]/15 text-[#2E7D32]" : "bg-[#C62828]/15 text-[#C62828]",
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
                          <span
                            className={cn(
                              "text-xs font-semibold uppercase",
                              isCovered ? "text-[#2E7D32]" : "text-[#C62828]",
                            )}
                          >
                            {isCovered ? t("dashboard.driversOnLoad") : t("dashboard.driversEmpty")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0">
                          {isCovered && (
                            <span className="truncate">
                              {block.loads.length} {t("dashboard.loads").toLowerCase()} • {block.loads[0]?.loadNumber ?? ""}
                            </span>
                          )}
                          {!isCovered && !block.driver.currentLocation && (
                            <span>{t("dashboard.driverNoLoadToday")}</span>
                          )}
                          {block.driver.currentLocation && (
                            <>
                              {isCovered && <span>•</span>}
                              <span className="truncate">{block.driver.currentLocation}</span>
                              <span className="text-[#C62828] font-bold uppercase tracking-wide shrink-0">
                                {t("dashboard.locationLive")}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>

                    {block.loads.length > 0 && (
                      <div className="mt-3 ml-11 space-y-2">
                        {block.loads.map((load) => (
                          <div
                            key={load.id}
                            className="rounded-lg border border-border bg-card/80 px-3 py-2 text-sm"
                          >
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="font-bold text-foreground">{load.loadNumber}</span>
                              <LoadStatusBadge status={load.status} />
                              <span className="text-muted-foreground">
                                {cityState(load.originCity, load.originState)} → {cityState(load.destCity, load.destState)}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                {t("dashboard.puDate")}: {formatDate(load.puDate)}
                              </span>
                              <span>
                                {t("loads.sheet.delDate")}: {load.delDate ? formatDate(load.delDate) : t("common.emDash")}
                              </span>
                              <span>
                                {t("loads.sheet.mileage")}: {formatNumber(load.mileage ?? 0)}
                              </span>
                              <span>
                                {t("dashboard.rate")}: {formatCurrency(load.rate ?? 0)}
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
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DriverTodayDetailSheet
        block={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}
