import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useListNotifications } from "@workspace/api-client-react";
import { AlertTriangle, X } from "lucide-react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const SCHEDULE_KINDS = new Set(["schedule_pu", "schedule_del"]);

export function ScheduleReminderBanner() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: notifications } = useListNotifications(
    { unreadOnly: true },
    { query: { refetchInterval: 30_000 } },
  );

  const scheduleAlerts = (notifications ?? []).filter(
    (n) => n.kind && SCHEDULE_KINDS.has(n.kind),
  );

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
      void qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  if (scheduleAlerts.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800">
      <div className="px-4 py-2 space-y-1.5">
        {scheduleAlerts.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-3 text-sm text-amber-950 dark:text-amber-100"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{t("notifications.scheduleReminder")}</p>
              <p className="text-xs sm:text-sm opacity-90">{n.text}</p>
              {n.loadId && (
                <Link
                  href="/loads"
                  className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
                >
                  {t("notifications.viewLoad")}
                </Link>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900"
              onClick={() => markRead.mutate(n.id)}
              title={t("notifications.dismiss")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
