import { useState, useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Check, Shield, User, Bell, Palette } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
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

export default function Settings() {
  const { data: me, isLoading } = useGetMe({});
  const { user: clerkUser } = useUser();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me?.name) setName(me.name);
  }, [me?.name]);

  const updateMe = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users/me"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-[#1A3C5E]">Settings</h1>

      {/* Profile Card */}
      <Card>
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-[#2196F3]" />
            <CardTitle className="text-base text-[#1A3C5E]">Profile</CardTitle>
          </div>
          <CardDescription>Your account details and display name.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Avatar + info */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-[#1A3C5E]">
              <AvatarImage src={clerkUser?.imageUrl} />
              <AvatarFallback className="bg-[#1A3C5E] text-white text-xl">
                {(name || me?.email || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              {isLoading ? (
                <Skeleton className="h-5 w-32 mb-1" />
              ) : (
                <p className="font-bold text-[#1A3C5E]">{me?.name || me?.email || "—"}</p>
              )}
              <p className="text-sm text-gray-500">{me?.email}</p>
              <Badge variant="outline" className={`mt-1 text-xs ${ROLE_COLORS[me?.role ?? "dispatcher"] || ""}`}>
                {ROLE_LABELS[me?.role ?? "dispatcher"] || me?.role}
              </Badge>
            </div>
          </div>

          {/* Edit name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            {isLoading ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : (
              <Input
                id="displayName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="border-gray-200 focus:border-[#1A3C5E]"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={me?.email ?? ""} disabled className="bg-gray-50 border-gray-200 text-gray-500" />
            <p className="text-xs text-gray-400">Email is managed through your Clerk account.</p>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Input value={ROLE_LABELS[me?.role ?? ""] || me?.role || ""} disabled className="bg-gray-50 border-gray-200 text-gray-500" />
            <p className="text-xs text-gray-400">Role is assigned by an administrator.</p>
          </div>

          {updateMe.error && (
            <p className="text-sm text-red-600">Failed to save. Please try again.</p>
          )}

          <Button
            className={`${saved ? "bg-green-600 hover:bg-green-600" : "bg-[#1A3C5E] hover:bg-[#122A42]"} text-white transition-colors`}
            onClick={() => updateMe.mutate()}
            disabled={updateMe.isPending || !name.trim()}
          >
            {saved ? (
              <><Check className="h-4 w-4 mr-2" /> Saved!</>
            ) : updateMe.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Account Security */}
      <Card>
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#2196F3]" />
            <CardTitle className="text-base text-[#1A3C5E]">Account Security</CardTitle>
          </div>
          <CardDescription>Password and two-factor authentication are managed through Clerk.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-gray-800 text-sm">Password & 2FA</p>
              <p className="text-xs text-gray-500">Change your password or enable two-factor authentication.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-200 text-[#1A3C5E]"
              onClick={() => window.open("https://accounts.clerk.dev/user", "_blank")}
            >
              Manage →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#2196F3]" />
            <CardTitle className="text-base text-[#1A3C5E]">Notification Preferences</CardTitle>
          </div>
          <CardDescription>When you receive in-app alerts.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {[
            { label: "Broker underpayment alerts", desc: "When a broker pays less than invoiced", enabled: true },
            { label: "New load assigned", desc: "When a load is assigned to you", enabled: true },
            { label: "Weekly summary", desc: "Weekly performance digest", enabled: false },
          ].map((pref) => (
            <div key={pref.label} className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-gray-800">{pref.label}</p>
                <p className="text-xs text-gray-500">{pref.desc}</p>
              </div>
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${pref.enabled ? "bg-[#1A3C5E]" : "bg-gray-300"}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${pref.enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">Notification preferences will be saved in a future update.</p>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card>
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-[#2196F3]" />
            <CardTitle className="text-base text-[#1A3C5E]">About</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-2 text-sm text-gray-500">
          <div className="flex justify-between"><span>Product</span><span className="font-medium text-gray-700">LoadBoard Pro</span></div>
          <div className="flex justify-between"><span>Version</span><span className="font-medium text-gray-700">1.0.0 MVP</span></div>
          <div className="flex justify-between"><span>User ID</span><span className="font-mono text-xs text-gray-500">{me?.id?.slice(0, 8)}…</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
