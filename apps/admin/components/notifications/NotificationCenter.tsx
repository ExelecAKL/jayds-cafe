"use client";
// apps/admin/components/notifications/NotificationCenter.tsx
// Topbar bell with an anchored panel: unread count, quick filters, grouped
// alerts, mark-as-read and a link to the full Notifications page.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../Operations";
import {
  categoryLabels,
  condenseForPanel,
  relativeTime,
  useAdminNotifications,
  type NotificationCategory,
} from "./AdminNotifications";
import {
  NotificationEmpty,
  NotificationGroups,
  NotificationSkeleton,
  useNow,
} from "./NotificationList";

export type NotificationFilter = "all" | "unread" | NotificationCategory;
export const notificationFilters: NotificationFilter[] = [
  "all",
  "unread",
  "orders",
  "stock",
  "customers",
  "team",
];
export const filterLabel = (filter: NotificationFilter) =>
  filter === "all" ? "All" : filter === "unread" ? "Unread" : categoryLabels[filter];

const PANEL_LIMIT = 30;

export function NotificationCenter() {
  const pathname = usePathname();
  const feed = useAdminNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const now = useNow();
  const shownPath = useRef(pathname);

  // Close when the page changes underneath the panel.
  useEffect(() => {
    if (shownPath.current !== pathname) {
      shownPath.current = pathname;
      void Promise.resolve().then(() => setOpen(false));
    }
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const pointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  // Shift + N toggles the panel from anywhere outside a text field.
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== "N" || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement).closest("input,textarea,select,[contenteditable='true']")) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  const filtered = useMemo(
    () =>
      feed.visible.filter((item) =>
        filter === "all"
          ? true
          : filter === "unread"
            ? !feed.isRead(item.id)
            : item.category === filter,
      ),
    [feed, filter],
  );
  // Long runs of the same stock condition read better as one summary here.
  const condensed = useMemo(() => condenseForPanel(filtered), [filtered]);
  const count = feed.unreadCount;
  const badge = count > 99 ? "99+" : String(count);
  // Ring the bell briefly when the unread count goes up after the first load.
  const [ringing, setRinging] = useState(false);
  const previousCount = useRef<number | null>(null);
  useEffect(() => {
    if (feed.loading) return;
    const previous = previousCount.current;
    previousCount.current = count;
    if (previous === null || count <= previous) return;
    void Promise.resolve().then(() => setRinging(true));
    const timer = setTimeout(() => setRinging(false), 1200);
    return () => clearTimeout(timer);
  }, [count, feed.loading]);

  return (
    <div className="ntf-root" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={`ops-alert-button ntf-trigger${open ? " is-open" : ""}${ringing ? " is-ringing" : ""}`}
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        aria-keyshortcuts="Shift+N"
        title="Notifications · Shift N"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="bell" />
        {count > 0 && (
          <b
            key={badge}
            className={`ntf-badge jm-pop${feed.urgentUnread ? " is-urgent" : ""}`}
            aria-hidden="true"
          >
            {badge}
          </b>
        )}
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          className="ntf-panel"
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
        >
          <header className="ntf-panel-header">
            <div>
              <h2>Notifications</h2>
              <p>
                {feed.loading
                  ? "Checking the café…"
                  : count
                    ? `${count} unread${feed.urgentUnread ? ` · ${feed.urgentUnread} urgent` : ""}`
                    : "Everything is read"}
              </p>
            </div>
            <button
              type="button"
              className="ops-button small"
              onClick={feed.markAllRead}
              disabled={!count}
            >
              <Icon name="check" size={15} />
              Mark all read
            </button>
          </header>
          <div className="ntf-filters" role="group" aria-label="Show">
            {notificationFilters.map((value) => {
              const total =
                value === "all"
                  ? feed.visible.length
                  : value === "unread"
                    ? count
                    : feed.visible.filter((item) => item.category === value).length;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {filterLabel(value)}
                  {total > 0 && <span>{total}</span>}
                </button>
              );
            })}
          </div>
          <div className="ntf-scroll" aria-busy={feed.loading}>
            {feed.loading && !feed.items.length ? (
              <NotificationSkeleton />
            ) : condensed.length ? (
              <NotificationGroups
                items={condensed}
                limit={PANEL_LIMIT}
                onNavigate={() => setOpen(false)}
              />
            ) : (
              <NotificationEmpty
                filtered={filter !== "all" && feed.visible.length > 0}
                onReset={() => setFilter("all")}
              />
            )}
            {(condensed.length > PANEL_LIMIT ||
              condensed.length < filtered.length) && (
              <p className="ntf-more">
                Grouped for a quick look.{" "}
                <Link href="/notifications" onClick={() => setOpen(false)}>
                  See all {filtered.length} alerts
                </Link>
              </p>
            )}
          </div>
          {feed.failedSources.length > 0 && (
            <p className="ntf-warning" role="status">
              <Icon name="alert" size={15} />
              <span>
                Could not check {feed.failedSources.join(", ")}.{" "}
                <button type="button" onClick={() => void feed.refresh()}>
                  Try again
                </button>
              </span>
            </p>
          )}
          {!feed.stockCheckedAt && (
            <p className="ntf-hint">
              <Icon name="stock" size={15} />
              <span>
                Stock alerts load with the Overview and Stock pages.{" "}
                <Link href="/inventory?filter=low" onClick={() => setOpen(false)}>
                  Check stock now
                </Link>
              </span>
            </p>
          )}
          <footer className="ntf-panel-footer">
            <span>
              {feed.refreshing ? (
                <>
                  <span className="ntf-sync" aria-hidden="true" />
                  Checking…
                </>
              ) : feed.lastChecked ? (
                `Checked ${relativeTime(feed.lastChecked, now).toLowerCase()}`
              ) : (
                "Not checked yet"
              )}
            </span>
            <button
              type="button"
              className="ntf-link is-refresh"
              onClick={() => void feed.refresh()}
              disabled={feed.refreshing}
            >
              <Icon name="refresh" size={14} />
              Refresh
            </button>
            <Link href="/notifications" className="ntf-link" onClick={() => setOpen(false)}>
              View all
              <Icon name="arrow" size={14} />
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
