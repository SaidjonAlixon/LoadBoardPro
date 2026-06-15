import { useState } from "react";
import { useListUsers, useGetMe } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck, UserPlus, Users, Pencil, CheckCircle, XCircle,
  Search, RefreshCw, Crown, Calculator, Truck, UserCog,
} from "lucide-react";
import { Link } from "wouter";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  dispatcher: "Dispatcher",
  accounting: "Accounting",
  driver: "Driver",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800 border-purple-200",
  dispatcher: "bg-blue-100 text-blue-800 border-blue-200",
  accounting: "bg-green-100 text-green-800 border-green-200",
  driver: "bg-orange-100 text-orange-800 border-orange-200",
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  admin: Crown,
  dispatcher: Truck,
  accounting: Calculator,
  driver: UserCog,
};

// ─── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ email: "", name: "", role: "dispatcher" });
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setForm({ email: "", name: "", role: "dispatcher" });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#1A3C5E] flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#2196F3]" /> Create User Account
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cu-name">Full Name</Label>
            <Input
              id="cu-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Jane Smith"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-email">Email <span className="text-red-500">*</span></Label>
            <Input
              id="cu-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@company.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role <span className="text-red-500">*</span></Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="dispatcher">Dispatcher</SelectItem>
                <SelectItem value="accounting">Accounting</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
            The user will sign in via Google or email using the address above. Their role is set immediately.
          </div>
          {mutation.error && (
            <p className="text-sm text-red-600">Failed to create user. Check email format.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#1A3C5E] hover:bg-[#122A42] text-white"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.email}
          >
            {mutation.isPending ? "Creating…" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────
function EditUserModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [role, setRole] = useState(user.role);
  const [name, setName] = useState(user.name ?? "");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role, name: name || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#1A3C5E] flex items-center gap-2">
            <Pencil className="h-4 w-4 text-[#2196F3]" /> Edit User
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
            <Avatar className="h-10 w-10 border border-gray-200">
              <AvatarFallback className="bg-[#1A3C5E] text-white text-sm font-bold">
                {(user.name || user.email || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-[#1A3C5E] text-sm">{user.name || "—"}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Display Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="dispatcher">Dispatcher</SelectItem>
                <SelectItem value="accounting">Accounting</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mutation.error && <p className="text-sm text-red-600">Failed to save.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#1A3C5E] hover:bg-[#122A42] text-white"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const qc = useQueryClient();

  const { data: me } = useGetMe({});
  const { data: users, isLoading, refetch } = useListUsers({});

  // Redirect non-admins
  if (me && me.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <ShieldCheck className="h-16 w-16 text-gray-300" />
        <h2 className="text-xl font-bold text-[#1A3C5E]">Admin Access Required</h2>
        <p className="text-gray-500 max-w-xs">
          You need the Admin role to access this page. Contact your administrator.
        </p>
        <Link href="/dashboard">
          <Button className="bg-[#1A3C5E] hover:bg-[#122A42] text-white">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users"] }),
  });

  const filtered = (users ?? []).filter((u) => {
    const matchSearch =
      !search ||
      (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  // Stats by role
  const roleCounts = (users ?? []).reduce<Record<string, number>>((acc, u) => {
    if (u.isActive) acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A3C5E] flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#2196F3]" /> Admin Panel
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage users, roles, and system access</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-gray-200 text-gray-600 gap-1.5"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            className="bg-[#2196F3] hover:bg-[#1E88E5] text-white gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <UserPlus className="h-4 w-4" /> Add User
          </Button>
        </div>
      </div>

      {/* Role stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["admin", "dispatcher", "accounting", "driver"] as const).map((role) => {
          const Icon = ROLE_ICONS[role];
          return (
            <Card
              key={role}
              className={`cursor-pointer transition-all hover:shadow-md ${roleFilter === role ? "ring-2 ring-[#1A3C5E]" : ""}`}
              onClick={() => setRoleFilter(roleFilter === role ? "all" : role)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${ROLE_COLORS[role].split(" ").slice(0, 2).join(" ")}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 capitalize">{ROLE_LABELS[role]}s</p>
                  <p className="text-xl font-bold text-[#1A3C5E]">
                    {isLoading ? "—" : roleCounts[role] ?? 0}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white border-gray-200 shadow-sm"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-44 border-gray-200 bg-white shadow-sm">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="dispatcher">Dispatcher</SelectItem>
            <SelectItem value="accounting">Accounting</SelectItem>
            <SelectItem value="driver">Driver</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <Card className="overflow-hidden shadow-sm border-gray-200">
        <CardHeader className="border-b border-gray-100 py-3 px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              <Users className="h-4 w-4 inline mr-2 text-[#2196F3]" />
              {filtered.length} {filtered.length === 1 ? "User" : "Users"}
            </CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3">Joined</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-5 w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => {
                  const RoleIcon = ROLE_ICONS[user.role] ?? Users;
                  const isSelf = user.id === me?.id;
                  return (
                    <tr
                      key={user.id}
                      className={`transition-colors hover:bg-gray-50 ${!user.isActive ? "opacity-50" : ""}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-gray-200">
                            <AvatarFallback className="bg-[#1A3C5E] text-white text-xs font-bold">
                              {(user.name || user.email || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-[#1A3C5E]">
                              {user.name || <span className="text-gray-400 italic">No name</span>}
                              {isSelf && (
                                <span className="ml-2 text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-normal">
                                  You
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{user.email}</td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="outline"
                          className={`gap-1 font-medium ${ROLE_COLORS[user.role] || ""}`}
                        >
                          <RoleIcon className="h-3 w-3" />
                          {ROLE_LABELS[user.role] || user.role}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => {
                            if (!isSelf) toggleActive.mutate({ id: user.id, isActive: !user.isActive });
                          }}
                          disabled={isSelf}
                          title={isSelf ? "Cannot deactivate yourself" : user.isActive ? "Deactivate" : "Activate"}
                          className="inline-flex items-center gap-1.5 disabled:cursor-not-allowed"
                        >
                          {user.isActive
                            ? <CheckCircle className="h-5 w-5 text-green-600" />
                            : <XCircle className="h-5 w-5 text-gray-400" />}
                          <span className={`text-xs font-medium ${user.isActive ? "text-green-700" : "text-gray-500"}`}>
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {new Date(user.createdAt as string).toLocaleDateString(undefined, {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#1A3C5E] hover:bg-blue-50 gap-1"
                          onClick={() => setEditUser(user)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        {!isLoading && (users ?? []).length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
            {(users ?? []).filter((u) => u.isActive).length} active ·{" "}
            {(users ?? []).filter((u) => !u.isActive).length} inactive ·{" "}
            {(users ?? []).length} total
          </div>
        )}
      </Card>

      {/* System Info Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="border-b border-gray-100 py-3 px-5">
            <CardTitle className="text-sm text-[#1A3C5E] font-semibold">Role Permissions</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3 text-xs">
            {[
              { role: "admin", perms: "Full access — manage users, all loads, delete anything" },
              { role: "dispatcher", perms: "Create & edit own loads, view drivers & brokers" },
              { role: "accounting", perms: "View all loads, edit invoice & broker payment fields" },
              { role: "driver", perms: "Read-only access to assigned loads" },
            ].map(({ role, perms }) => (
              <div key={role} className="flex items-start gap-2">
                <Badge variant="outline" className={`shrink-0 mt-0.5 ${ROLE_COLORS[role]}`}>
                  {ROLE_LABELS[role]}
                </Badge>
                <span className="text-gray-500 leading-relaxed">{perms}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-gray-100 py-3 px-5">
            <CardTitle className="text-sm text-[#1A3C5E] font-semibold">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-2">
            {[
              { label: "Manage Drivers", href: "/drivers", desc: "Add, edit, activate drivers" },
              { label: "Loads Board", href: "/loads", desc: "View and manage all loads" },
              { label: "Accounting", href: "/accounting", desc: "Invoice & payment tracking" },
              { label: "Notifications", href: "/notifications", desc: "System alerts and messages" },
            ].map(({ label, href, desc }) => (
              <Link key={href} href={href}>
                <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer group">
                  <div>
                    <p className="font-medium text-[#1A3C5E] text-sm group-hover:underline">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <span className="text-gray-300 group-hover:text-[#2196F3] text-lg">→</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
    </div>
  );
}
