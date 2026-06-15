import { useState } from "react";
import { useListNotifications } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, BellOff, AlertTriangle, CheckCheck, ExternalLink } from "lucide-react";
import { Link } from "wouter";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Notifications() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

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
          <h1 className="text-2xl font-bold text-[#1A3C5E]">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-[#E65100] text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={unreadOnly ? "border-[#1A3C5E] text-[#1A3C5E] bg-blue-50" : "border-gray-200 text-gray-600"}
            onClick={() => setUnreadOnly((v) => !v)}
          >
            {unreadOnly ? <Bell className="h-4 w-4 mr-1" /> : <BellOff className="h-4 w-4 mr-1" />}
            {unreadOnly ? "Showing Unread" : "Show Unread Only"}
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-gray-200 text-gray-600"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark All Read
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden shadow-sm border-gray-200">
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
          <CardContent className="p-16 text-center text-gray-400">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium text-gray-500">
              {unreadOnly ? "No unread notifications." : "You're all caught up!"}
            </p>
            <p className="text-sm mt-1">Alerts like broker underpayments will appear here.</p>
          </CardContent>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-4 p-5 transition-colors ${
                  !n.isRead ? "bg-blue-50/40 hover:bg-blue-50/60" : "hover:bg-gray-50"
                }`}
              >
                {/* Icon */}
                <div className={`p-2.5 rounded-full shrink-0 mt-0.5 ${!n.isRead ? "bg-orange-100" : "bg-gray-100"}`}>
                  <AlertTriangle className={`h-4 w-4 ${!n.isRead ? "text-[#E65100]" : "text-gray-400"}`} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-relaxed ${!n.isRead ? "text-gray-900 font-medium" : "text-gray-600"}`}>
                    {n.text}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-gray-400">{timeAgo(n.createdAt as string)}</span>
                    {n.loadId && (
                      <Link href={`/loads/${n.loadId}`} className="text-xs text-[#2196F3] hover:underline flex items-center gap-0.5">
                        View Load <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {!n.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-[#1A3C5E] text-xs h-7 px-2"
                      onClick={() => markRead.mutate(n.id)}
                      disabled={markRead.isPending}
                    >
                      <CheckCheck className="h-3.5 w-3.5 mr-1" />
                      Mark Read
                    </Button>
                  )}
                  {n.isRead && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <CheckCheck className="h-3 w-3" /> Read
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
