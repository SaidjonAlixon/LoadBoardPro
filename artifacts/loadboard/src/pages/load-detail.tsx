import { Link, useParams } from "wouter";
import { useGetLoad } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { LoadStatusBadge } from "@/components/load-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Truck,
  MapPin,
  DollarSign,
  User,
  Building2,
  FileText,
  AlertTriangle,
} from "lucide-react";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

export default function LoadDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { t, formatCurrency, formatDate, formatNumber } = useI18n();
  const { data: load, isLoading, isError } = useGetLoad(id, { query: { enabled: !!id } });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (isError || !load) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">{t("loadDetail.notFound")}</p>
        <Link href="/loads">
          <Button variant="outline">{t("loadDetail.back")}</Button>
        </Link>
      </div>
    );
  }

  const gross = (load.rate ?? 0) + (load.reimbursement ?? 0);
  const isUnderpaid = (load.biDiff ?? 0) < 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/loads">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t("loadDetail.back")}
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{load.loadNumber}</h1>
              <LoadStatusBadge status={load.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{t("loadDetail.title")}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4 text-accent" />
              {t("loadDetail.route")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="bg-green-50 p-2 rounded-lg">
                <MapPin className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("loadDetail.pickup")}</p>
                <p className="font-semibold text-foreground">
                  {load.originCity}, {load.originState}
                </p>
                <p className="text-sm text-muted-foreground">{formatDate(load.puDate)}</p>
              </div>
            </div>
            <div className="border-l-2 border-dashed border-border ml-5 h-4" />
            <div className="flex items-start gap-3">
              <div className="bg-red-50 p-2 rounded-lg">
                <MapPin className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("loadDetail.delivery")}</p>
                <p className="font-semibold text-foreground">
                  {load.destCity}, {load.destState}
                </p>
                <p className="text-sm text-muted-foreground">{formatDate(load.delDate)}</p>
              </div>
            </div>
            <DetailRow
              label={t("loads.mileage")}
              value={`${formatNumber(load.mileage)} ${t("weekly.miles").toLowerCase()}`}
            />
            <DetailRow label={t("loadDetail.weekStart")} value={formatDate(load.weekStart)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-accent" />
              {t("loadDetail.overview")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <DetailRow
              label={t("loads.driver")}
              value={load.driver?.fullName ?? t("common.unassigned")}
            />
            <DetailRow
              label={t("loads.broker")}
              value={load.broker?.name ?? t("common.emDash")}
            />
            <DetailRow
              label={t("loadDetail.dispatcher")}
              value={load.dispatcher?.name || load.dispatcher?.email || t("common.emDash")}
            />
            {load.driver?.truckNumber && (
              <DetailRow label={t("drivers.truckNumber")} value={load.driver.truckNumber} />
            )}
            {load.broker?.phone && (
              <DetailRow label={t("drivers.phone")} value={load.broker.phone} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-accent" />
              {t("loadDetail.financials")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <DetailRow label={t("loads.rate")} value={formatCurrency(load.rate)} />
            <DetailRow label={t("loads.reimbursement")} value={formatCurrency(load.reimbursement ?? 0)} />
            <DetailRow label={t("loadDetail.gross")} value={formatCurrency(gross)} />
            <DetailRow
              label={t("dashboard.avgRpm")}
              value={`${formatCurrency(load.rpm ?? 0)}${t("common.perMile")}`}
            />
          </CardContent>
        </Card>

        <Card className={isUnderpaid ? "ring-2 ring-red-200" : ""}>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4 text-accent" />
              {t("loadDetail.accounting")}
              {isUnderpaid && <AlertTriangle className="h-4 w-4 text-red-500 ml-auto" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <DetailRow
              label={t("weekly.invoiced")}
              value={
                load.invoicedAmount != null
                  ? formatCurrency(load.invoicedAmount)
                  : t("accounting.notInvoiced")
              }
            />
            <DetailRow
              label={t("weekly.paid")}
              value={
                load.brokerPaid != null
                  ? formatCurrency(load.brokerPaid)
                  : t("accounting.pending")
              }
            />
            <DetailRow
              label={t("loadDetail.irDiff")}
              value={
                load.irDiff != null ? (
                  <span className={load.irDiff < 0 ? "text-red-600" : "text-green-700"}>
                    {formatCurrency(load.irDiff)}
                  </span>
                ) : (
                  t("common.emDash")
                )
              }
            />
            <DetailRow
              label={t("loadDetail.biDiff")}
              value={
                load.biDiff != null ? (
                  <span className={`flex items-center gap-1 justify-end ${isUnderpaid ? "text-red-600" : "text-green-700"}`}>
                    {isUnderpaid && <AlertTriangle className="h-3 w-3" />}
                    {formatCurrency(load.biDiff)}
                  </span>
                ) : (
                  t("common.emDash")
                )
              }
            />
          </CardContent>
        </Card>
      </div>

      {(load.dispatchNotes || load.notes) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="text-base text-foreground flex items-center gap-2">
                <Truck className="h-4 w-4 text-accent" />
                {t("loadDetail.dispatchNotes")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {load.dispatchNotes || t("loadDetail.noNotes")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="text-base text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-accent" />
                {t("loadDetail.internalNotes")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {load.notes || t("loadDetail.noNotes")}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
