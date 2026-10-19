"use client";
// apps/admin/components/notifications/NotificationList.tsx
// One notification row and the grouped list used by the bell panel and the
// full Notifications page.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton, SkeletonStatus, repeat } from "@cafeos/shared/ui/skeleton";
import { Icon } from "../Operations";
import {
  categoryLabels,
  relativeTime,
  useAdminNotifications,
  type AdminNotification,
} from "./AdminNotifications";

/** Re-render relative times every half minute without refetching. */
export function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

export function NotificationItem({
  item,
  now,
  onNavigate,
}: {
  item: AdminNotification;
  now: number;
  onNavigate?: () => void;
}) {
  const { isRead, markRead, markUnread } = useAdminNotifications();
  const ids = item.members ?? [item.id];
  const read = ids.every(isRead);
  return (
    <li
      className={`ntf-item tone-${item.severity}${read ? "" : " is-unread"}`}
    >
      <span className="ntf-icon" aria-hidden="true">
        <Icon name={item.icon} size={17} />
      </span>
      <div className="ntf-body">
        <Link
          href={item.href}
          className="ntf-title"
          onClick={() => {
            markRead(ids);
            onNavigate?.();
          }}
        >
          {!read && <span className="sr-only">Unread: </span>}
          {item.title}
        </Link>
        <p className="ntf-description">{item.description}</p>
        <p className="ntf-meta">
          <span>{categoryLabels[item.category]}</span>
          <span aria-hidden="true">·</span>
          {item.at ? (
            <time dateTime={item.at} title={new Date(item.at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}>
              {relativeTime(item.at, now)}
            </time>
          ) : (
            <span>Ongoing</span>
          )}
          <span aria-hidden="true">·</span>
          <span className="ntf-action">
            {item.actionLabel}
            <Icon name="arrow" size={13} />
          </span>
        </p>
      </div>
      <button
        type="button"
        className="ntf-toggle"
        aria-label={read ? `Mark “${item.title}” as unread` : `Mark “${item.title}” as read`}
        title={read ? "Mark as unread" : "Mark as read"}
        onClick={() => (read ? markUnread(ids) : markRead(ids))}
      >
        {read ? <span className="ntf-ring" /> : <span className="ntf-dot" />}
      </button>
    </li>
  );
}

export function NotificationGroups({
  items,
  onNavigate,
  limit,
}: {
  items: AdminNotification[];
  onNavigate?: () => void;
  limit?: number;
}) {
  const now = useNow();
  const shown = limit ? items.slice(0, limit) : items;
  const attention = shown.filter((item) => item.severity !== "info");
  const activity = shown.filter((item) => item.severity === "info");
  return (
    <>
      {attention.length > 0 && (
        <section className="ntf-group" aria-label="Needs attention">
          <h3>
            Needs attention <span>{attention.length}</span>
          </h3>
          <ul className="ntf-list jm-stagger">
            {attention.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                now={now}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </section>
      )}
      {activity.length > 0 && (
        <section className="ntf-group" aria-label="Recent activity">
          <h3>
            Recent activity <span>{activity.length}</span>
          </h3>
          <ul className="ntf-list jm-stagger">
            {activity.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                now={now}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function NotificationSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonStatus label="Loading notifications" className="ntf-skeleton">
      {repeat(rows, (index) => (
        <div className="ntf-item" key={index} aria-hidden="true">
          <Skeleton shape="block" width={34} height={34} radius={10} />
          <div className="jsk-stack">
            <Skeleton width={["72%", "58%", "66%", "50%"][index % 4]} height={13} />
            <Skeleton width={["88%", "76%", "82%", "70%"][index % 4]} height={11} />
            <Skeleton width={140} height={10} />
          </div>
        </div>
      ))}
    </SkeletonStatus>
  );
}

export function NotificationEmpty({
  filtered,
  onReset,
}: {
  filtered: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="ntf-empty jm-reveal">
      <span className="ntf-empty-icon" aria-hidden="true">
        <Icon name="check" size={22} />
      </span>
      <strong>{filtered ? "Nothing matches this view" : "You’re all caught up"}</strong>
      <p>
        {filtered
          ? "Try another filter to see the rest of your notifications."
          : "New orders, stock alerts, help requests and staff approvals will appear here as they happen."}
      </p>
      {filtered && onReset && (
        <button type="button" className="ops-button small" onClick={onReset}>
          Show everything
        </button>
      )}
    </div>
  );
}
