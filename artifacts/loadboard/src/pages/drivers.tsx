import { useState } from "react";
import { useListDrivers, useDeleteDriver } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Truck, Phone, Mail, Hash, CheckCircle, XCircle, Pencil, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

const API = "/api";

interface DriverFormData {
  fullName: string;
  driverType: "OO" | "CD" | "Lease";
  phone: string;
  email: string;
  truckNumber: string;
}

const EMPTY_FORM: DriverFormData = { fullName: "", driverType: "OO", phone: "", email: "", truckNumber: "" };

function DriverForm({
  open,
  onClose,
  initial,
  driverId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: DriverFormData & { id?: string };
  driverId?: string;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<DriverFormData>(initial ?? EMPTY_FORM);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: DriverFormData) => {
      const res = await fetch(driverId ? `${API}/drivers/${driverId}` : `${API}/drivers`, {
        method: driverId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save driver");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/drivers"] });
      onClose();
    },
  });

  const set = (k: keyof DriverFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">{driverId ? t("drivers.editDriver") : t("drivers.addDriver")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t("drivers.fullName")}</Label>
            <Input id="fullName" value={form.fullName} onChange={set("fullName")} required placeholder={t("drivers.fullNamePh")} />
          </div>
          <div className="space-y-2">
            <Label>{t("drivers.driverType")}</Label>
            <Select value={form.driverType} onValueChange={(v) => setForm((f) => ({ ...f, driverType: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OO">{t("drivers.oo")}</SelectItem>
                <SelectItem value="CD">{t("drivers.cd")}</SelectItem>
                <SelectItem value="Lease">{t("drivers.lease")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("drivers.phone")}</Label>
              <Input id="phone" value={form.phone} onChange={set("phone")} placeholder={t("drivers.phonePh")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="truckNumber">{t("drivers.truckNumber")}</Label>
              <Input id="truckNumber" value={form.truckNumber} onChange={set("truckNumber")} placeholder={t("drivers.truckPh")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("drivers.email")}</Label>
            <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder={t("drivers.emailPh")} />
          </div>
          {mutation.error && (
            <p className="text-sm text-red-600">{t("drivers.saveFailed")}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" disabled={mutation.isPending}>
              {mutation.isPending ? t("common.saving") : driverId ? t("drivers.saveChanges") : t("drivers.addDriver")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const TYPE_COLORS: Record<string, string> = {
  OO: "bg-blue-100 text-blue-800 border-primary/30",
  CD: "bg-green-100 text-green-800 border-green-200",
  Lease: "bg-purple-100 text-purple-800 border-purple-200",
};

const TYPE_LABEL_KEYS: Record<string, string> = {
  OO: "drivers.ownerOperators",
  CD: "drivers.companyDrivers",
  Lease: "drivers.leaseDrivers",
};

const TYPE_DISPLAY_KEYS: Record<string, string> = {
  OO: "drivers.ooShort",
  CD: "drivers.cdShort",
  Lease: "drivers.lease",
};

export default function DriversList() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editDriver, setEditDriver] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fullName: string } | null>(null);

  const { data: drivers, isLoading } = useListDrivers({});

  const filtered = (drivers ?? []).filter((d) => {
    const matchSearch =
      !search ||
      d.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (d.truckNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || d.driverType === typeFilter;
    return matchSearch && matchType;
  });

  const qc = useQueryClient();
  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await fetch(`${API}/drivers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/drivers"] }),
  });

  const deleteMutation = useDeleteDriver({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["/api/drivers"] });
        setDeleteTarget(null);
        toast.success(t("drivers.deleteSuccess"));
      },
      onError: () => toast.error(t("drivers.deleteFailed")),
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-foreground">{t("drivers.title")}</h1>
        <Button className="bg-accent hover:bg-accent/90 text-white" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> {t("drivers.addDriver")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("drivers.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted/50 border-border"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-44 border-border bg-card">
              <SelectValue placeholder={t("drivers.allTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("drivers.allTypesFilter")}</SelectItem>
              <SelectItem value="OO">{t("drivers.ooShort")}</SelectItem>
              <SelectItem value="CD">{t("drivers.cdShort")}</SelectItem>
              <SelectItem value="Lease">{t("drivers.lease")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["OO", "CD", "Lease"] as const).map((type) => (
          <Card key={type}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{t(TYPE_LABEL_KEYS[type])}</p>
              <p className="text-2xl font-bold text-foreground">
                {isLoading ? t("common.emDash") : (drivers ?? []).filter((d) => d.driverType === type && d.isActive).length}
              </p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t("drivers.totalActive")}</p>
            <p className="text-2xl font-bold text-accent">
              {isLoading ? t("common.emDash") : (drivers ?? []).filter((d) => d.isActive).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden shadow-sm border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b sticky top-0">
              <tr>
                <th className="px-6 py-4">{t("dashboard.driver")}</th>
                <th className="px-6 py-4">{t("drivers.type")}</th>
                <th className="px-6 py-4">{t("drivers.truckNumber")}</th>
                <th className="px-6 py-4">{t("drivers.phone")}</th>
                <th className="px-6 py-4">{t("drivers.email")}</th>
                <th className="px-6 py-4 text-center">{t("dashboard.status")}</th>
                <th className="px-6 py-4 text-right">{t("drivers.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-5 w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    {t("drivers.noDrivers")}
                  </td>
                </tr>
              ) : (
                filtered.map((driver) => (
                  <tr key={driver.id} className={`hover:bg-primary/10/40 transition-colors ${!driver.isActive ? "opacity-50" : ""}`}>
                    <td className="px-6 py-4">
                      <Link href={`/drivers/${driver.id}`} className="flex items-center gap-3 group">
                        <div className="bg-[#E3F2FD] p-2 rounded-full">
                          <Truck className="h-4 w-4 text-foreground" />
                        </div>
                        <span className="font-semibold text-foreground group-hover:underline">{driver.fullName}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={TYPE_COLORS[driver.driverType] || ""}>
                        {t(TYPE_DISPLAY_KEYS[driver.driverType] ?? driver.driverType)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {driver.truckNumber ? (
                        <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{driver.truckNumber}</span>
                      ) : t("common.emDash")}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {driver.phone ? (
                        <a href={`tel:${driver.phone}`} className="flex items-center gap-1 hover:text-accent">
                          <Phone className="h-3 w-3" />{driver.phone}
                        </a>
                      ) : t("common.emDash")}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {driver.email ? (
                        <a href={`mailto:${driver.email}`} className="flex items-center gap-1 hover:text-accent truncate max-w-[180px]">
                          <Mail className="h-3 w-3" />{driver.email}
                        </a>
                      ) : t("common.emDash")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActive.mutate({ id: driver.id, isActive: !driver.isActive })}
                        className="inline-flex items-center gap-1"
                        title={driver.isActive ? t("drivers.deactivate") : t("drivers.activate")}
                      >
                        {driver.isActive
                          ? <CheckCircle className="h-5 w-5 text-green-600" />
                          : <XCircle className="h-5 w-5 text-muted-foreground" />}
                        <span className={`text-xs font-medium ${driver.isActive ? "text-green-700" : "text-muted-foreground"}`}>
                          {driver.isActive ? t("status.active") : t("status.inactive")}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-foreground hover:bg-primary/10"
                          onClick={() => setEditDriver(driver)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> {t("common.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteTarget({ id: driver.id, fullName: driver.fullName })}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("drivers.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <DriverForm open={addOpen} onClose={() => setAddOpen(false)} />
      {editDriver && (
        <DriverForm
          open={!!editDriver}
          onClose={() => setEditDriver(null)}
          driverId={editDriver.id}
          initial={{
            fullName: editDriver.fullName,
            driverType: editDriver.driverType,
            phone: editDriver.phone ?? "",
            email: editDriver.email ?? "",
            truckNumber: editDriver.truckNumber ?? "",
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("drivers.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? t("drivers.deleteConfirm", { name: deleteTarget.fullName })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
            >
              {deleteMutation.isPending ? t("common.saving") : t("drivers.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
