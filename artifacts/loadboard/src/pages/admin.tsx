import { useState } from "react";
import { useListUsers, useGetMe } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck, UserPlus, Users, Pencil, CheckCircle, XCircle,
  Search, RefreshCw, Crown, Calculator, Truck, UserCog, Trash2, Copy, Eye, EyeOff,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { translateRole } from "@/lib/i18n/translate";
import { toast } from "sonner";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800 border-purple-200",
  dispatcher: "bg-blue-100 text-blue-800 border-primary/30",
  accounting: "bg-green-100 text-green-800 border-green-200",
  driver: "bg-orange-100 text-orange-800 border-orange-200",
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  admin: Crown,
  dispatcher: Truck,
  accounting: Calculator,
  driver: UserCog,
};

const ROLE_STAT_KEYS: Record<string, string> = {
  admin: "admin.admins",
  dispatcher: "admin.dispatchers",
  accounting: "admin.accountings",
  driver: "admin.drivers",
};

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  t,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  t: (key: string) => string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

type AdminUser = {
  id: string;
  nickname?: string | null;
  email?: string | null;
  name?: string | null;
  role: string;
  isActive: boolean;
  usesCustomPassword?: boolean;
  createdAt?: string;
};

type CredentialsView = {
  nickname: string;
  password: string | null;
  usesCustomPassword?: boolean;
  canReveal?: boolean;
};

function loginHandle(user: AdminUser): string {
  const raw = (user.nickname ?? user.email ?? "").trim().replace(/^@+/, "");
  if (!raw) return "";
  if (user.nickname) return user.nickname.toLowerCase();
  if (raw.includes("@")) return raw.split("@")[0]!.toLowerCase();
  return raw.toLowerCase();
}

function loginLabel(user: AdminUser): string {
  const handle = loginHandle(user);
  return handle ? `@${handle}` : "—";
}

/** @deprecated use loginHandle */
function userLogin(user: AdminUser): string {
  return loginHandle(user);
}

function normalizeCredentialNickname(value: string): string {
  const raw = value.trim().replace(/^@+/, "");
  if (raw.includes("@")) return raw.split("@")[0]!.toLowerCase();
  return raw.toLowerCase();
}

function CredentialsPanel({
  credentials,
  t,
  onCopy,
}: {
  credentials: CredentialsView;
  t: (key: string) => string;
  onCopy: () => void;
}) {
  const nickname = normalizeCredentialNickname(credentials.nickname);
  return (
    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 dark:bg-emerald-950/25 dark:border-emerald-800/60 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-white/70 dark:bg-background/40 border border-emerald-100 dark:border-emerald-900/40 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">
            {t("admin.nickname")}
          </p>
          <p className="font-mono text-sm font-semibold text-foreground break-all">
            {nickname ? `@${nickname}` : t("common.emDash")}
          </p>
        </div>
        <div className="rounded-lg bg-white/70 dark:bg-background/40 border border-emerald-100 dark:border-emerald-900/40 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">
            {t("admin.generatedPassword")}
          </p>
          {credentials.password ? (
            <p className="font-mono text-sm font-bold text-foreground break-all">{credentials.password}</p>
          ) : (
            <p className="text-xs text-muted-foreground leading-snug">{t("admin.customPasswordHidden")}</p>
          )}
        </div>
      </div>
      {credentials.password && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-emerald-300/70 bg-white/80 hover:bg-white dark:bg-background/50"
          onClick={() => void onCopy()}
        >
          <Copy className="h-3.5 w-3.5" /> {t("admin.copyCredentials")}
        </Button>
      )}
    </div>
  );
}

async function copyLoginCredentials(
  t: (key: string, vars?: Record<string, string | number>) => string,
  nickname: string,
  password: string | null,
) {
  const handle = normalizeCredentialNickname(nickname);
  const text = password
    ? `${t("admin.nickname")}: ${handle}\n${t("admin.generatedPassword")}: ${password}`
    : `${t("admin.nickname")}: ${handle}`;
  await navigator.clipboard.writeText(text);
  toast.success(t("admin.credentialsCopied"));
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ nickname: "", firstName: "", lastName: "", role: "dispatcher", password: "" });
  const [created, setCreated] = useState<{ nickname: string; password: string; name: string } | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nickname: form.nickname,
          firstName: form.firstName,
          lastName: form.lastName,
          role: form.role,
          password: form.password.trim() || undefined,
        }),
      });
      const text = await res.text();
      let data: { error?: string; generatedPassword?: string; user?: { nickname?: string; name: string | null } } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text.slice(0, 200) || "Failed" };
      }
      if (!res.ok) throw new Error(data.error || t("admin.createFailed"));
      return data as { user: { nickname?: string; name: string | null }; generatedPassword: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setCreated({
        nickname: data.user.nickname ?? form.nickname,
        password: data.generatedPassword,
        name: data.user.name || `${form.firstName} ${form.lastName}`.trim(),
      });
      setForm({ nickname: "", firstName: "", lastName: "", role: "dispatcher", password: "" });
    },
  });

  const handleClose = () => {
    setCreated(null);
    mutation.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" /> {t("admin.userCreated")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("admin.credentialsHint")}</p>
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("common.user")}</p>
                  <p className="font-semibold text-foreground">{created.name}</p>
                </div>
                <CredentialsPanel
                  credentials={{ nickname: created.nickname, password: created.password }}
                  t={t}
                  onCopy={() => copyLoginCredentials(t, created.nickname, created.password)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => void copyLoginCredentials(t, created.nickname, created.password)}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> {t("admin.copyCredentials")}
              </Button>
              <Button className="bg-primary hover:bg-primary/90 text-white" onClick={handleClose}>
                {t("common.done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-accent" /> {t("admin.createUser")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cu-first">{t("admin.firstName")} <span className="text-red-500">*</span></Label>
                  <Input
                    id="cu-first"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    placeholder={t("admin.firstNamePh")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cu-last">{t("admin.lastName")} <span className="text-red-500">*</span></Label>
                  <Input
                    id="cu-last"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    placeholder={t("admin.lastNamePh")}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-nickname">{t("admin.nickname")} <span className="text-red-500">*</span></Label>
                <Input
                  id="cu-nickname"
                  value={form.nickname}
                  onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                  placeholder={t("admin.nicknamePh")}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-password">{t("admin.customPassword")}</Label>
                <PasswordInput
                  id="cu-password"
                  value={form.password}
                  onChange={(password) => setForm((f) => ({ ...f, password }))}
                  placeholder={t("admin.customPasswordPh")}
                  t={t}
                />
                <p className="text-[11px] text-muted-foreground">{t("admin.customPasswordHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.role")} <span className="text-red-500">*</span></Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{translateRole(t, "admin")}</SelectItem>
                    <SelectItem value="dispatcher">{translateRole(t, "dispatcher")}</SelectItem>
                    <SelectItem value="accounting">{translateRole(t, "accounting")}</SelectItem>
                    <SelectItem value="driver">{translateRole(t, "driver")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-primary/10 border border-blue-100 rounded-lg p-3 text-xs text-primary">
                {t("admin.createHint")}
              </div>
              {mutation.error && (
                <p className="text-sm text-red-600">
                  {mutation.error.message === "Nickname already registered"
                    ? t("admin.nicknameAlreadyRegistered")
                    : mutation.error.message || t("admin.createFailed")}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>{t("common.cancel")}</Button>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => mutation.mutate()}
                disabled={
                  mutation.isPending
                  || !form.nickname.trim()
                  || !form.firstName.trim()
                  || !form.lastName.trim()
                }
              >
                {mutation.isPending ? t("admin.creating") : t("admin.addUser")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditUserModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { t } = useI18n();
  const [role, setRole] = useState(user.role);
  const [name, setName] = useState(user.name ?? "");
  const [isActive, setIsActive] = useState(user.isActive);
  const [customPassword, setCustomPassword] = useState("");
  const [credentials, setCredentials] = useState<CredentialsView | null>(null);
  const qc = useQueryClient();
  const handle = loginHandle(user);
  const RoleIcon = ROLE_ICONS[role] ?? Users;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          role,
          name: name || undefined,
          isActive,
          ...(customPassword.trim() ? { password: customPassword.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      if (customPassword.trim()) {
        setCredentials({ nickname: handle, password: customPassword.trim(), usesCustomPassword: true });
        setCustomPassword("");
      } else {
        onClose();
      }
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      if (!data.generatedPassword || typeof data.generatedPassword !== "string") {
        throw new Error(t("admin.generatePasswordFailed"));
      }
      return data as { generatedPassword: string; nickname?: string };
    },
    onMutate: () => {
      setCredentials(null);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setCredentials({
        nickname: data.nickname ?? handle,
        password: data.generatedPassword,
        usesCustomPassword: true,
      });
      setCustomPassword("");
      toast.success(t("admin.newPasswordGenerated"));
    },
    onError: (err: Error) => {
      setCredentials(null);
      toast.error(err.message || t("admin.saveFailed"));
    },
  });

  const viewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user.id}/credentials`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      return data as CredentialsView;
    },
    onSuccess: (data) => {
      setCredentials({
        nickname: data.nickname || handle,
        password: data.password,
        usesCustomPassword: data.usesCustomPassword,
        canReveal: data.canReveal,
      });
      if (!data.password) {
        toast.message(t("admin.viewCredentialsNoPassword"));
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || t("admin.saveFailed"));
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <DialogTitle className="text-foreground flex items-center gap-2 text-lg">
            <Pencil className="h-4 w-4 text-accent" /> {t("admin.editUser")}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          <div className="rounded-xl border border-border bg-gradient-to-br from-muted/50 via-card to-muted/30 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Avatar className="h-12 w-12 border-2 border-background shadow-sm shrink-0">
                <AvatarFallback className="bg-primary text-white text-base font-bold">
                  {(user.name || handle || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-base text-foreground truncate">
                    {user.name || t("common.emDash")}
                  </p>
                  <Badge variant="outline" className={`gap-1 text-[10px] ${ROLE_COLORS[role] || ""}`}>
                    <RoleIcon className="h-3 w-3" />
                    {translateRole(t, role)}
                  </Badge>
                  {!isActive && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                      {t("status.inactive")}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("admin.login")}
                  </p>
                  <p className="text-sm font-mono font-semibold text-accent">{loginLabel(user)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">{t("admin.displayName")}</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("admin.fullNamePh")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.role")}</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{translateRole(t, "admin")}</SelectItem>
                  <SelectItem value="dispatcher">{translateRole(t, "dispatcher")}</SelectItem>
                  <SelectItem value="accounting">{translateRole(t, "accounting")}</SelectItem>
                  <SelectItem value="driver">{translateRole(t, "driver")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("admin.loginAccess")}
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t("admin.disableLogin")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("admin.disableLoginHint")}</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} className="shrink-0" />
            </div>
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="edit-password">{t("admin.customPassword")}</Label>
              <PasswordInput
                id="edit-password"
                value={customPassword}
                onChange={setCustomPassword}
                placeholder={t("admin.customPasswordPh")}
                t={t}
              />
              <p className="text-[11px] text-muted-foreground">{t("admin.customPasswordHint")}</p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => viewMutation.mutate()}
                disabled={viewMutation.isPending}
              >
                {viewMutation.isPending ? t("admin.viewingCredentials") : t("admin.viewCredentials")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? t("admin.generatingNewPassword") : t("admin.generateNewPassword")}
              </Button>
              <p className="text-[11px] text-muted-foreground w-full">{t("admin.generateNewPasswordHint")}</p>
            </div>
          </div>

          {credentials && (
            <CredentialsPanel
              credentials={credentials}
              t={t}
              onCopy={() => void copyLoginCredentials(t, credentials.nickname, credentials.password)}
            />
          )}

          {mutation.error && <p className="text-sm text-red-600">{t("admin.saveFailed")}</p>}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/20 gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-white min-w-[88px]"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPanel() {
  const { t, formatDate } = useI18n();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const qc = useQueryClient();

  const { data: me } = useGetMe({});
  const { data: users, isLoading, refetch } = useListUsers({});

  if (me && me.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <ShieldCheck className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-xl font-bold text-foreground">{t("admin.accessDenied")}</h2>
        <p className="text-muted-foreground max-w-xs">
          {t("admin.accessDeniedBody")}
        </p>
        <Link href="/dashboard">
          <Button className="bg-primary hover:bg-primary/90 text-white">{t("admin.backDashboard")}</Button>
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

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const text = await res.text();
      let data: { error?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text.slice(0, 200) || "Failed" };
      }
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/api/users"] });
      setDeleteTarget(null);
      toast.success(t("admin.deleteSuccess"));
    },
    onError: (err: Error) => {
      const msg = err.message;
      if (msg === "Cannot delete your own account") toast.error(t("admin.cannotDeleteSelf"));
      else if (msg === "Cannot delete the last administrator") toast.error(t("admin.cannotDeleteLastAdmin"));
      else toast.error(t("admin.deleteFailed"));
    },
  });

  const filtered = (users ?? []).filter((u) => {
    const login = userLogin(u as AdminUser);
    const matchSearch =
      !search ||
      (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      login.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleCounts = (users ?? []).reduce<Record<string, number>>((acc, u) => {
    if (u.isActive) acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});

  const permKeys = [
    { role: "admin", key: "admin.permAdmin" },
    { role: "dispatcher", key: "admin.permDispatcher" },
    { role: "accounting", key: "admin.permAccounting" },
    { role: "driver", key: "admin.permDriver" },
  ] as const;

  const quickLinks = [
    { labelKey: "admin.linkDrivers", descKey: "admin.linkDriversDesc", href: "/drivers" },
    { labelKey: "admin.linkLoads", descKey: "admin.linkLoadsDesc", href: "/loads" },
    { labelKey: "admin.linkAccounting", descKey: "admin.linkAccountingDesc", href: "/accounting" },
    { labelKey: "admin.linkNotifications", descKey: "admin.linkNotificationsDesc", href: "/notifications" },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-accent" /> {t("admin.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("admin.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-border text-muted-foreground gap-1.5"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t("admin.refresh")}
          </Button>
          <Button
            className="bg-accent hover:bg-accent/90 text-white gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <UserPlus className="h-4 w-4" /> {t("admin.addUser")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["admin", "dispatcher", "accounting", "driver"] as const).map((role) => {
          const Icon = ROLE_ICONS[role];
          return (
            <Card
              key={role}
              className={`cursor-pointer transition-all hover:shadow-md ${roleFilter === role ? "ring-2 ring-primary" : ""}`}
              onClick={() => setRoleFilter(roleFilter === role ? "all" : role)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${ROLE_COLORS[role].split(" ").slice(0, 2).join(" ")}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t(ROLE_STAT_KEYS[role])}</p>
                  <p className="text-xl font-bold text-foreground">
                    {isLoading ? t("common.emDash") : roleCounts[role] ?? 0}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("admin.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border shadow-sm"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-44 border-border bg-card shadow-sm">
            <SelectValue placeholder={t("admin.allRoles")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.allRoles")}</SelectItem>
            <SelectItem value="admin">{translateRole(t, "admin")}</SelectItem>
            <SelectItem value="dispatcher">{translateRole(t, "dispatcher")}</SelectItem>
            <SelectItem value="accounting">{translateRole(t, "accounting")}</SelectItem>
            <SelectItem value="driver">{translateRole(t, "driver")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden shadow-sm border-border">
        <CardHeader className="border-b border-border py-3 px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Users className="h-4 w-4 inline mr-2 text-accent" />
              {filtered.length === 1
                ? t("admin.user", { count: filtered.length })
                : t("admin.users", { count: filtered.length })}
            </CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
              <tr>
                <th className="px-6 py-3">{t("common.user")}</th>
                <th className="px-6 py-3">{t("admin.login")}</th>
                <th className="px-6 py-3">{t("admin.role")}</th>
                <th className="px-6 py-3 text-center">{t("dashboard.status")}</th>
                <th className="px-6 py-3">{t("admin.joined")}</th>
                <th className="px-6 py-3 text-right">{t("drivers.actions")}</th>
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
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    {t("admin.noUsers")}
                  </td>
                </tr>
              ) : (
                filtered.map((user) => {
                  const RoleIcon = ROLE_ICONS[user.role] ?? Users;
                  const isSelf = user.id === me?.id;
                  return (
                    <tr
                      key={user.id}
                      className={`transition-colors hover:bg-muted/50 ${!user.isActive ? "opacity-50" : ""}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-border">
                            <AvatarFallback className="bg-primary text-white text-xs font-bold">
                              {(user.name || userLogin(user as AdminUser) || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-foreground">
                              {user.name || <span className="text-muted-foreground italic">{t("admin.noName")}</span>}
                              {isSelf && (
                                <span className="ml-2 text-xs bg-blue-100 text-primary rounded-full px-2 py-0.5 font-normal">
                                  {t("admin.you")}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-accent">{loginLabel(user as AdminUser)}</td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="outline"
                          className={`gap-1 font-medium ${ROLE_COLORS[user.role] || ""}`}
                        >
                          <RoleIcon className="h-3 w-3" />
                          {translateRole(t, user.role)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => {
                            if (!isSelf) toggleActive.mutate({ id: user.id, isActive: !user.isActive });
                          }}
                          disabled={isSelf}
                          title={isSelf ? t("admin.cannotDeactivateSelf") : user.isActive ? t("drivers.deactivate") : t("drivers.activate")}
                          className="inline-flex items-center gap-1.5 disabled:cursor-not-allowed"
                        >
                          {user.isActive
                            ? <CheckCircle className="h-5 w-5 text-green-600" />
                            : <XCircle className="h-5 w-5 text-muted-foreground" />}
                          <span className={`text-xs font-medium ${user.isActive ? "text-green-700" : "text-muted-foreground"}`}>
                            {user.isActive ? t("status.active") : t("status.inactive")}
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">
                        {formatDate(user.createdAt as string)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-foreground hover:bg-primary/10 gap-1"
                            onClick={() => setEditUser(user)}
                          >
                            <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 gap-1"
                            disabled={isSelf || deleteUser.isPending}
                            title={isSelf ? t("admin.cannotDeleteSelf") : t("admin.delete")}
                            onClick={() =>
                              setDeleteTarget({
                                id: user.id,
                                label: user.name || userLogin(user as AdminUser),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" /> {t("admin.delete")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && (users ?? []).length > 0 && (
          <div className="px-6 py-3 border-t border-border bg-muted/50 text-xs text-muted-foreground">
            {t("admin.footerStats", {
              active: (users ?? []).filter((u) => u.isActive).length,
              inactive: (users ?? []).filter((u) => !u.isActive).length,
              total: (users ?? []).length,
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="border-b border-border py-3 px-5">
            <CardTitle className="text-sm text-foreground font-semibold">{t("admin.rolePermissions")}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3 text-xs">
            {permKeys.map(({ role, key }) => (
              <div key={role} className="flex items-start gap-2">
                <Badge variant="outline" className={`shrink-0 mt-0.5 ${ROLE_COLORS[role]}`}>
                  {translateRole(t, role)}
                </Badge>
                <span className="text-muted-foreground leading-relaxed">{t(key)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-3 px-5">
            <CardTitle className="text-sm text-foreground font-semibold">{t("admin.quickLinks")}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-2">
            {quickLinks.map(({ labelKey, descKey, href }) => (
              <Link key={href} href={href}>
                <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer group">
                  <div>
                    <p className="font-medium text-foreground text-sm group-hover:underline">{t(labelKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(descKey)}</p>
                  </div>
                  <span className="text-muted-foreground/50 group-hover:text-accent text-lg">→</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? t("admin.deleteConfirm", { name: deleteTarget.label }) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteTarget && deleteUser.mutate(deleteTarget.id)}
            >
              {deleteUser.isPending ? t("admin.deleting") : t("admin.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
