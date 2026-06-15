import { useState } from "react";
import { useListDrivers } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Truck, Phone, Mail, Hash, CheckCircle, XCircle, Pencil } from "lucide-react";
import { Link } from "wouter";

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
          <DialogTitle className="text-[#1A3C5E]">{driverId ? "Edit Driver" : "Add Driver"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name *</Label>
            <Input id="fullName" value={form.fullName} onChange={set("fullName")} required placeholder="James Wilson" />
          </div>
          <div className="space-y-2">
            <Label>Driver Type *</Label>
            <Select value={form.driverType} onValueChange={(v) => setForm((f) => ({ ...f, driverType: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OO">Owner Operator (OO)</SelectItem>
                <SelectItem value="CD">Company Driver (CD)</SelectItem>
                <SelectItem value="Lease">Lease</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="214-555-0100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="truckNumber">Truck #</Label>
              <Input id="truckNumber" value={form.truckNumber} onChange={set("truckNumber")} placeholder="TX-1042" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="driver@email.com" />
          </div>
          {mutation.error && (
            <p className="text-sm text-red-600">Failed to save. Please try again.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-[#1A3C5E] hover:bg-[#122A42] text-white" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : driverId ? "Save Changes" : "Add Driver"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const TYPE_COLORS: Record<string, string> = {
  OO: "bg-blue-100 text-blue-800 border-blue-200",
  CD: "bg-green-100 text-green-800 border-green-200",
  Lease: "bg-purple-100 text-purple-800 border-purple-200",
};

export default function DriversList() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editDriver, setEditDriver] = useState<any | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#1A3C5E]">Drivers</h1>
        <Button className="bg-[#2196F3] hover:bg-[#1E88E5] text-white" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Driver
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search name, truck #, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-gray-50 border-gray-200"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-44 border-gray-200 bg-white">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="OO">Owner Operator</SelectItem>
              <SelectItem value="CD">Company Driver</SelectItem>
              <SelectItem value="Lease">Lease</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {["OO", "CD", "Lease"].map((type) => (
          <Card key={type}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">{type === "OO" ? "Owner Operators" : type === "CD" ? "Company Drivers" : "Lease Drivers"}</p>
              <p className="text-2xl font-bold text-[#1A3C5E]">
                {isLoading ? "—" : (drivers ?? []).filter((d) => d.driverType === type && d.isActive).length}
              </p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Total Active</p>
            <p className="text-2xl font-bold text-[#2196F3]">
              {isLoading ? "—" : (drivers ?? []).filter((d) => d.isActive).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="overflow-hidden shadow-sm border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b sticky top-0">
              <tr>
                <th className="px-6 py-4">Driver</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Truck #</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
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
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No drivers found.
                  </td>
                </tr>
              ) : (
                filtered.map((driver) => (
                  <tr key={driver.id} className={`hover:bg-blue-50/40 transition-colors ${!driver.isActive ? "opacity-50" : ""}`}>
                    <td className="px-6 py-4">
                      <Link href={`/drivers/${driver.id}`} className="flex items-center gap-3 group">
                        <div className="bg-[#E3F2FD] p-2 rounded-full">
                          <Truck className="h-4 w-4 text-[#1A3C5E]" />
                        </div>
                        <span className="font-semibold text-[#1A3C5E] group-hover:underline">{driver.fullName}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={TYPE_COLORS[driver.driverType] || ""}>
                        {driver.driverType}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {driver.truckNumber ? (
                        <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{driver.truckNumber}</span>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {driver.phone ? (
                        <a href={`tel:${driver.phone}`} className="flex items-center gap-1 hover:text-[#2196F3]">
                          <Phone className="h-3 w-3" />{driver.phone}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {driver.email ? (
                        <a href={`mailto:${driver.email}`} className="flex items-center gap-1 hover:text-[#2196F3] truncate max-w-[180px]">
                          <Mail className="h-3 w-3" />{driver.email}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActive.mutate({ id: driver.id, isActive: !driver.isActive })}
                        className="inline-flex items-center gap-1"
                        title={driver.isActive ? "Deactivate" : "Activate"}
                      >
                        {driver.isActive
                          ? <CheckCircle className="h-5 w-5 text-green-600" />
                          : <XCircle className="h-5 w-5 text-gray-400" />}
                        <span className={`text-xs font-medium ${driver.isActive ? "text-green-700" : "text-gray-500"}`}>
                          {driver.isActive ? "Active" : "Inactive"}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#1A3C5E] hover:bg-blue-50"
                        onClick={() => setEditDriver(driver)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
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
    </div>
  );
}
