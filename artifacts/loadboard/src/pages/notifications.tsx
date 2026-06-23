import { useState } from "react";
import { useListNotifications } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, BellOff, AlertTriangle, CheckCheck, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";

export default function Notifications() {
  const { t } = useI18n();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("notifications.justNow");
    if (mins < 60) return t("notifications.minutesAgo", { mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("notifications.hoursAgo", { hrs });
    return t("notifications.daysAgo", { days: Math.floor(hrs / 24) });
  };

  const { data: notifications, isLoading } = useListNotifications({ unreadOnly });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isRead: true }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const unreadCount = (notifications ?? []).filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{t("notifications.title")}</h1>
          {unreadCount > 0 && (
            <span className="bg-[#E65100] text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {t("notifications.unread", { count: unreadCount })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={unreadOnly ? "border-primary text-foreground bg-primary/10" : "border-border text-muted-foreground"}
            onClick={() => setUnreadOnly((v) => !v)}
          >
            {unreadOnly ? <Bell className="h-4 w-4 mr-1" /> : <BellOff className="h-4 w-4 mr-1" />}
            {unreadOnly ? t("notifications.showingUnread") : t("notifications.showUnread")}
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden shadow-sm border-border">
        {isLoading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-5 flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <CardContent className="p-16 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium text-muted-foreground">
              {unreadOnly ? t("notifications.noUnread") : t("notifications.allCaughtUp")}
            </p>
            <p className="text-sm mt-1">{t("notifications.hint")}</p>
          </CardContent>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-4 p-5 transition-colors ${
                  !n.isRead ? "bg-primary/10/40 hover:bg-primary/10/60" : "hover:bg-muted/50"
                }`}
              >
                <div className={`p-2.5 rounded-full shrink-0 mt-0.5 ${!n.isRead ? "bg-orange-100" : "bg-muted"}`}>
                  <AlertTriangle className={`h-4 w-4 ${!n.isRead ? "text-[#E65100]" : "text-muted-foreground"}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-relaxed ${!n.isRead ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {n.text}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt as string)}</span>
                    {n.loadId && (
                      <Link href={`/loads/${n.loadId}`} className="text-xs text-accent hover:underline flex items-center gap-0.5">
                        {t("notifications.viewLoad")} <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!n.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground text-xs h-7 px-2"
                      onClick={() => markRead.mutate(n.id)}
                      disabled={markRead.isPending}
                    >
                      <CheckCheck className="h-3.5 w-3.5 mr-1" />
                      {t("notifications.markRead")}
                    </Button>
                  )}
                  {n.isRead && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CheckCheck className="h-3 w-3" /> {t("notifications.read")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
