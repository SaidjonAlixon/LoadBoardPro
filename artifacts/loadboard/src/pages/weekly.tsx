import { useState } from "react";
import { useListWeeks, useGetWeeklyView } from "@workspace/api-client-react";
import type { WeeklyDriverBlock } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { ChevronDown, Truck, DollarSign, Route, TrendingUp, Users } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { formatWeekRangeLabel, getThisWeekStart, normalizeWeekStart } from "@/lib/date-range";

function DriverStatusCard({
  total,
  onLoad,
  empty,
}: {
  total: number;
  onLoad: number;
  empty: number;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div className="w-full">
            <p className="text-xs text-muted-foreground font-medium mb-1">{t("weekly.driverStats")}</p>
            <div className="space-y-1.5 mt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("weekly.driversTotal")}</span>
                <span className="font-bold text-foreground">{total}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("weekly.driversOnLoadToday")}</span>
                <span className="font-bold text-[#1976D2]">{onLoad}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("weekly.driversEmptyToday")}</span>
                <span className="font-bold text-[#2E7D32]">{empty}</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">{t("weekly.driverStatsHint")}</p>
          </div>
          <div className="p-2 rounded-lg bg-orange-50 text-orange-600 shrink-0 ml-2">
            <Users className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
            <p className="text-xl font-bold text-foreground">{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const DRIVER_TYPE_KEYS: Record<string, string> = {
  OO: "drivers.ooShort",
  CD: "drivers.cdShort",
  Lease: "drivers.lease",
};

type SectionVariant = "onLoad" | "empty";

const SECTION_STYLES: Record<
  SectionVariant,
  {
    wrapper: string;
    header: string;
    badge: string;
    blockHeader: string;
    blockIcon: string;
    blockSub: string;
  }
> = {
  onLoad: {
    wrapper:
      "rounded-xl border-2 border-[#1976D2]/30 bg-[#E3F2FD]/60 dark:bg-[#0D47A1]/15 dark:border-[#42A5F5]/40 shadow-sm",
    header: "bg-[#1976D2] text-white",
    badge: "bg-white/20 text-white",
    blockHeader: "bg-[#1565C0] text-white",
    blockIcon: "bg-[#42A5F5] text-white",
    blockSub: "text-blue-100",
  },
  empty: {
    wrapper:
      "rounded-xl border-2 border-[#2E7D32]/30 bg-[#E8F5E9]/60 dark:bg-[#1B5E20]/15 dark:border-[#66BB6A]/40 shadow-sm",
    header: "bg-[#2E7D32] text-white",
    badge: "bg-white/20 text-white",
    blockHeader: "bg-[#388E3C] text-white",
    blockIcon: "bg-[#66BB6A] text-white",
    blockSub: "text-green-100",
  },
};

function DriverBlock({ block, variant }: { block: WeeklyDriverBlock; variant: SectionVariant }) {
  const { t, formatCurrency, formatDate, formatNumber } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const styles = SECTION_STYLES[variant];
  const totalGross = block.loads.reduce((s, l) => s + (l.rate ?? 0) + (l.reimbursement ?? 0), 0);
  const totalMiles = block.loads.reduce((s, l) => s + (l.mileage ?? 0), 0);

  return (
    <Card className="overflow-hidden border-0 shadow-md">
      <div
        className={`flex items-center justify-between p-4 cursor-pointer select-none ${styles.blockHeader}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={`rounded-full p-1.5 ${styles.blockIcon}`}>
            <Truck className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-sm">{block.driver.fullName}</p>
            <p className={`text-xs ${styles.blockSub}`}>
              {t(DRIVER_TYPE_KEYS[block.driver.driverType] ?? block.driver.driverType)}
              {block.driver.truckNumber ? ` • #${block.driver.truckNumber}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className={`text-xs ${styles.blockSub}`}>{t("dashboard.loads")}</p>
            <p className="font-bold">{block.loads.length}</p>
          </div>
          <div>
            <p className={`text-xs ${styles.blockSub}`}>{t("weekly.miles")}</p>
            <p className="font-bold">{formatNumber(totalMiles)}</p>
          </div>
          <div>
            <p className={`text-xs ${styles.blockSub}`}>{t("dashboard.gross")}</p>
            <p className="font-bold">{formatCurrency(totalGross)}</p>
          </div>
          <ChevronDown
            className={`h-4 w-4 ${styles.blockSub} transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          {block.loads.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("weekly.noLoadsWeek")}
            </div>
          ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
              <tr>
                <th className="px-4 py-3">{t("dashboard.loadNumber")}</th>
                <th className="px-4 py-3">{t("dashboard.route")}</th>
                <th className="px-4 py-3">{t("weekly.pu")}</th>
                <th className="px-4 py-3">{t("weekly.del")}</th>
                <th className="px-4 py-3 text-right">{t("weekly.miles")}</th>
                <th className="px-4 py-3 text-right">{t("dashboard.rate")}</th>
                <th className="px-4 py-3 text-right">{t("dashboard.avgRpm")}</th>
                <th className="px-4 py-3 text-right">{t("weekly.reimb")}</th>
                <th className="px-4 py-3">{t("loads.broker")}</th>
                <th className="px-4 py-3">{t("weekly.dispatcher")}</th>
                <th className="px-4 py-3 text-center">{t("dashboard.status")}</th>
                <th className="px-4 py-3 text-right">{t("weekly.invoiced")}</th>
                <th className="px-4 py-3 text-right">{t("weekly.paid")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(block.loads as any[]).map((load: any) => {
                const biDiff = load.brokerPaid !== null && load.invoicedAmount !== null
                  ? load.brokerPaid - load.invoicedAmount
                  : null;
                return (
                  <tr key={load.id} className={`hover:bg-primary/10/40 ${biDiff !== null && biDiff < 0 ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap">{load.loadNumber}</td>
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">
                      {load.originCity}, {load.originState} → {load.destCity}, {load.destState}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(load.puDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(load.delDate)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(load.mileage)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(load.rate)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{load.rpm ? t("weekly.rpmPerMile", { rpm: load.rpm.toFixed(2) }) : t("common.emDash")}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{load.reimbursement > 0 ? formatCurrency(load.reimbursement) : t("common.emDash")}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{(load.broker as any)?.name || t("common.emDash")}</td>
                    <td className="px-4 py-3 text-foreground whitespace-nowrap font-medium">
                      {(load.dispatcher as any)?.name || (load.dispatcher as any)?.email || t("common.emDash")}
                    </td>
                    <td className="px-4 py-3 text-center"><LoadStatusBadge status={load.status} /></td>
                    <td className="px-4 py-3 text-right">{load.invoicedAmount !== null ? formatCurrency(load.invoicedAmount) : t("common.emDash")}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${biDiff !== null && biDiff < 0 ? "text-red-600" : ""}`}>
                      {load.brokerPaid !== null ? formatCurrency(load.brokerPaid) : t("common.emDash")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      )}
    </Card>
  );
}

function DriverSection({
  title,
  count,
  drivers,
  emptyMessage,
  variant,
}: {
  title: string;
  count: number;
  drivers: WeeklyDriverBlock[];
  emptyMessage: string;
  variant: SectionVariant;
}) {
  const styles = SECTION_STYLES[variant];
  return (
    <section className={`${styles.wrapper} overflow-hidden`}>
      <div
        className={`sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 ${styles.header} shadow-md`}
      >
        <h2 className="text-base sm:text-lg font-bold tracking-wide">{title}</h2>
        <span className={`text-sm font-bold px-3 py-1 rounded-full min-w-[2rem] text-center ${styles.badge}`}>
          {count}
        </span>
      </div>
      <div className="p-4 space-y-4">
        {drivers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/80 p-8 text-center text-muted-foreground text-sm">
            {emptyMessage}
          </div>
        ) : (
          drivers.map((block, i) => (
            <DriverBlock key={block.driver.id ?? i} block={block} variant={variant} />
          ))
        )}
      </div>
    </section>
  );
}

export default function WeeklyView() {
  const { t, formatCurrency, formatDate, formatNumber } = useI18n();
  const { data: weeks, isLoading: weeksLoading } = useListWeeks({});
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  const activeWeek = normalizeWeekStart(selectedWeek ?? weeks?.[0]?.weekStart ?? getThisWeekStart());

  const formatWeekLabel = (weekStart: string) =>
    formatWeekRangeLabel(weekStart, formatDate);

  const { data: weekData, isLoading: weekLoading } = useGetWeeklyView(activeWeek, {
    query: { enabled: !!activeWeek } as any,
  });

  const kpi = weekData?.kpi;
  const driverStatus = weekData?.driverStatus;
  const driversOnLoadToday =
    weekData?.driversOnLoadToday ??
    weekData?.drivers?.filter((b) =>
      b.loads.some(
        (l) =>
          ["Booked", "InQM", "NeedRevRC", "Issue", "PickedUp"].includes(l.status) &&
          l.puDate <= new Date().toISOString().split("T")[0] &&
          l.delDate >= new Date().toISOString().split("T")[0],
      ),
    ) ??
    [];
  const driversEmptyToday =
    weekData?.driversEmptyToday ??
    weekData?.drivers?.filter((b) => !driversOnLoadToday.some((on) => on.driver.id === b.driver.id)) ??
    [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-foreground">{t("weekly.title")}</h1>
        <div className="w-full sm:w-72">
          {weeksLoading ? (
            <Skeleton className="h-10 w-full rounded-md" />
          ) : (
            <Select value={activeWeek} onValueChange={(v) => setSelectedWeek(normalizeWeekStart(v))}>
              <SelectTrigger className="border-border bg-card shadow-sm">
                <SelectValue placeholder={t("weekly.selectWeek")} />
              </SelectTrigger>
              <SelectContent>
                {weeks?.map((w) => (
                  <SelectItem key={w.weekStart} value={w.weekStart}>
                    {t("weekly.weekOption", { dateRange: formatWeekLabel(w.weekStart), loadCount: w.loadCount })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {weekLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : kpi ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label={t("weekly.totalGross")} value={formatCurrency(kpi.totalGross)} icon={DollarSign} color="bg-primary/10 text-blue-600" />
          <KpiCard label={t("weekly.totalMiles")} value={formatNumber(kpi.totalMileage ?? 0)} icon={Route} color="bg-indigo-50 text-indigo-600" />
          <KpiCard label={t("weekly.avgRpm")} value={t("weekly.rpmPerMile", { rpm: (kpi.avgRpm ?? 0).toFixed(2) })} icon={TrendingUp} color="bg-green-50 text-green-600" />
          <KpiCard label={t("weekly.activeDrivers")} value={String(kpi.activeDrivers)} icon={Users} color="bg-orange-50 text-orange-600" />
          <KpiCard label={t("weekly.ooCd")} value={`${kpi.ooCount} / ${kpi.cdCount}`} icon={Truck} color="bg-purple-50 text-purple-600" />
          <DriverStatusCard
            total={driverStatus?.totalDrivers ?? 0}
            onLoad={driverStatus?.driversOnLoad ?? 0}
            empty={driverStatus?.driversEmpty ?? 0}
          />
        </div>
      ) : null}

      {weekLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-14 w-full rounded-none" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : activeWeek ? (
        <div className="space-y-6">
          <DriverSection
            title={t("weekly.sectionOnLoadToday")}
            count={driversOnLoadToday.length}
            drivers={driversOnLoadToday}
            emptyMessage={t("weekly.noDriversOnLoadToday")}
            variant="onLoad"
          />
          <DriverSection
            title={t("weekly.sectionEmptyToday")}
            count={driversEmptyToday.length}
            drivers={driversEmptyToday}
            emptyMessage={t("weekly.noDriversEmptyToday")}
            variant="empty"
          />
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {t("weekly.noWeeks")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
