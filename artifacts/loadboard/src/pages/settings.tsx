import { useState, useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Check, Shield, User, Bell, Palette } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { translateRole } from "@/lib/i18n/translate";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { getAvatarUrl, getRoleAvatarKeys } from "@/lib/profile-avatars";
import { cn } from "@/lib/utils";

function userLogin(user?: { nickname?: string | null; email?: string | null } | null): string {
  const raw = user?.nickname ?? user?.email ?? "";
  if (!raw) return "";
  if (user?.nickname) return user.nickname;
  if (raw.includes("@")) return raw.split("@")[0]!.toLowerCase();
  return raw.toLowerCase();
}

function userLoginLabel(user?: { nickname?: string | null; email?: string | null } | null): string {
  const login = userLogin(user);
  return login ? `@${login}` : "";
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  dispatcher: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  accounting: "bg-green-500/15 text-green-300 border-green-500/30",
  driver: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

export default function Settings() {
  const { t } = useI18n();
  const { data: me, isLoading } = useGetMe({});
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [avatarSaved, setAvatarSaved] = useState(false);

  useEffect(() => {
    if (me?.name) setName(me.name);
  }, [me?.name]);

  const updateMe = useMutation({
    mutationFn: async (payload: { name?: string; avatarKey?: string | null }) => {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/users/me"] });
      if (variables.avatarKey !== undefined) {
        setAvatarSaved(true);
        setTimeout(() => setAvatarSaved(false), 2000);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    },
  });

  const role = me?.role ?? "dispatcher";
  const avatarOptions = getRoleAvatarKeys(role);
  const login = userLogin(me as { nickname?: string | null; email?: string | null });
  const loginLabel = userLoginLabel(me as { nickname?: string | null; email?: string | null });

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-4">
      <h1 className="text-xl font-bold text-foreground shrink-0">{t("settings.title")}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-border py-3 px-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-accent shrink-0" />
              <CardTitle className="text-sm text-foreground">{t("settings.profile")}</CardTitle>
            </div>
            <CardDescription className="text-xs">{t("settings.profileDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
              {/* Left: preview + avatar picker */}
              <div className="rounded-xl border border-border bg-muted/20 p-5 sm:p-6 flex flex-col items-center text-center">
                <UserAvatar
                  name={name || me?.name}
                  email={login || me?.email}
                  avatarKey={me?.avatarKey}
                  className="h-24 w-24 border-4 border-primary/30 shadow-lg"
                  fallbackClassName="text-3xl font-semibold"
                />
                <div className="mt-4 space-y-1 min-w-0 w-full">
                  {isLoading ? (
                    <Skeleton className="h-5 w-36 mx-auto" />
                  ) : (
                    <p className="font-bold text-lg text-foreground truncate">
                      {me?.name || loginLabel || t("common.emDash")}
                    </p>
                  )}
                  <p className="text-sm font-mono text-accent truncate">{loginLabel || t("common.emDash")}</p>
                  <Badge variant="outline" className={`mt-2 text-xs ${ROLE_COLORS[role] || ""}`}>
                    {translateRole(t, role)}
                  </Badge>
                </div>

                {avatarOptions.length > 0 && (
                  <div className="w-full mt-6 pt-5 border-t border-border text-left">
                    <Label className="text-sm font-semibold text-foreground">
                      {t("settings.chooseAvatar")}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">
                      {t("settings.chooseAvatarHint")}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {avatarOptions.map((key) => {
                        const selected = me?.avatarKey === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            title={key}
                            disabled={updateMe.isPending}
                            onClick={() => updateMe.mutate({ avatarKey: key })}
                            className={cn(
                              "group flex flex-col items-center gap-2 rounded-xl border-2 p-2 transition-all",
                              selected
                                ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                                : "border-border bg-card hover:border-accent/50 hover:bg-muted/40",
                            )}
                          >
                            <img
                              src={getAvatarUrl(key)}
                              alt={key}
                              className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover bg-muted"
                            />
                            {selected && (
                              <span className="text-[10px] font-semibold text-accent uppercase tracking-wide">
                                {t("settings.avatarActive")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {avatarSaved && (
                      <p className="text-xs text-green-500 flex items-center gap-1 mt-3">
                        <Check className="h-3.5 w-3.5" /> {t("settings.avatarSaved")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Right: account form */}
              <div className="flex flex-col justify-center gap-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    {t("settings.accountDetails")}
                  </h3>
                  <p className="text-xs text-muted-foreground">{t("settings.accountDetailsHint")}</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="displayName" className="text-xs font-medium">
                      {t("settings.displayName")}
                    </Label>
                    {isLoading ? (
                      <Skeleton className="h-10 w-full rounded-md" />
                    ) : (
                      <Input
                        id="displayName"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("settings.displayNamePh")}
                        className="h-10 border-border focus:border-primary bg-card"
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">{t("settings.nickname")}</Label>
                      <Input
                        value={loginLabel || login || ""}
                        disabled
                        className="h-10 bg-muted/40 border-border text-muted-foreground text-sm font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">{t("settings.role")}</Label>
                      <Input
                        value={translateRole(t, me?.role ?? "") || me?.role || ""}
                        disabled
                        className="h-10 bg-muted/40 border-border text-muted-foreground text-sm"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2 text-xs text-muted-foreground">
                    <p>{t("settings.nicknameHint")}</p>
                    <p>{t("settings.roleHint")}</p>
                  </div>

                  {updateMe.error && (
                    <p className="text-xs text-red-500">{t("settings.saveFailed")}</p>
                  )}

                  <Button
                    className={`w-full sm:w-auto ${saved ? "bg-green-600 hover:bg-green-600" : "bg-primary hover:bg-primary/90"} text-white`}
                    onClick={() => updateMe.mutate({ name })}
                    disabled={updateMe.isPending || !name.trim()}
                  >
                    {saved ? (
                      <>
                        <Check className="h-4 w-4 mr-2" /> {t("settings.saved")}
                      </>
                    ) : updateMe.isPending ? (
                      t("common.saving")
                    ) : (
                      t("settings.saveChanges")
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-3 px-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-accent shrink-0" />
                  <CardTitle className="text-sm text-foreground">{t("theme.appearance")}</CardTitle>
                </div>
                <CardDescription className="text-xs mt-1">{t("theme.appearanceHint")}</CardDescription>
              </div>
              <ThemeToggle />
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-3 px-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent shrink-0" />
              <CardTitle className="text-sm text-foreground">{t("settings.security")}</CardTitle>
            </div>
            <CardDescription className="text-xs">{t("settings.securityDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <p className="text-xs text-muted-foreground">{t("settings.securitySoon")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-3 px-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-accent shrink-0" />
              <CardTitle className="text-sm text-foreground">{t("settings.notifications")}</CardTitle>
            </div>
            <CardDescription className="text-xs">{t("settings.notificationsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3 space-y-2">
            {[
              { labelKey: "settings.prefUnderpayment", descKey: "settings.prefUnderpaymentDesc", enabled: true },
              { labelKey: "settings.prefNewLoad", descKey: "settings.prefNewLoadDesc", enabled: true },
              { labelKey: "settings.prefWeekly", descKey: "settings.prefWeeklyDesc", enabled: false },
            ].map((pref) => (
              <div key={pref.labelKey} className="flex items-center justify-between gap-3 py-0.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{t(pref.labelKey)}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{t(pref.descKey)}</p>
                </div>
                <div
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${pref.enabled ? "bg-primary" : "bg-muted"}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card shadow transition-transform ${pref.enabled ? "translate-x-4.5" : "translate-x-0.5"}`}
                  />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-1">{t("settings.notificationsSoon")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-3 px-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-accent shrink-0" />
              <CardTitle className="text-sm text-foreground">{t("settings.about")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3 space-y-1.5 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2">
              <span>{t("settings.product")}</span>
              <span className="font-medium text-foreground">{t("brand")}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>{t("settings.version")}</span>
              <span className="font-medium text-foreground">{t("settings.versionValue")}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>{t("settings.userId")}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{me?.id?.slice(0, 8)}…</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
