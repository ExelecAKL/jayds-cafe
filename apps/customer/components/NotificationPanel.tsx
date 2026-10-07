// apps/customer/components/NotificationPanel.tsx
// Slide-up notification panel with real-time updates

"use client";

import { useEffect, useRef } from "react";
import { useNotifications } from "@cafeos/shared/hooks/useNotifications";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import type { Notification } from "@cafeos/shared/types";

const ICON_MAP: Record<string, string> = {
  order_update: "📋",
  stock_alert: "📦",
  promo: "🎁",
  voucher: "🏷️",
  system: "⚙️",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationPanel({
  open,
  onClose,
}: NotificationPanelProps) {
  const { user } = useAuth();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } =
    useNotifications(user?.id);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm animate-fade-in">
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-bg-primary shadow-2xl animate-slide-in-right flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-text-primary">
              Notifications
            </h2>
            {unreadCount > 0 && (
              <p className="text-xs text-text-muted mt-0.5">
                {unreadCount} unread
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="text-xs text-accent font-medium hover:underline"
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="text-4xl mb-3">🔔</div>
              <p className="text-sm text-text-secondary">
                No notifications yet
              </p>
              <p className="text-xs text-text-muted mt-1">
                You&apos;ll see order updates, promos, and alerts here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n: Notification) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.is_read) markAsRead(n.id);
                  }}
                  className={`w-full text-left px-5 py-4 transition-colors hover:bg-bg-elevated ${
                    !n.is_read ? "bg-accent/5" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="text-xl flex-shrink-0 mt-0.5">
                      {ICON_MAP[n.type] || "🔔"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm font-medium ${!n.is_read ? "text-text-primary" : "text-text-secondary"}`}
                        >
                          {n.title}
                        </p>
                        {!n.is_read && (
                          <div className="w-2 h-2 bg-accent rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-text-faint mt-1">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
