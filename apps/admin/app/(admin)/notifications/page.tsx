"use client";
// apps/admin/app/(admin)/notifications/page.tsx
// Every current back-office alert in one place, with filters and
// per-device preferences for which alerts count and pop up.
import { useMemo, useState } from "react";
import { Icon, PageHeader } from "../../../components/Operations";
import { ColorLegend } from "../../../components/StatusSemantics";
import {
  categoryLabels,
  relativeTime,
  useAdminNotifications,
  type NotificationCategory,
} from "../../../components/notifications/AdminNotifications";
import {
  filterLabel,
  notificationFilters,
  type NotificationFilter,
} from "../../../components/notifications/NotificationCenter";
import {
  NotificationEmpty,
  NotificationGroups,
  NotificationSkeleton,
  useNow,
} from "../../../components/notifications/NotificationList";

const categoryHelp: Record<NotificationCategory, string> = {
  orders: "Blocked orders, payment checks and new orders",
  stock: "Low or empty stock and batches about to expire",
  customers: "Help requests waiting for a reply",
  team: "Staff waiting for access and POS cancellations",
};

export default function NotificationsPage() {
  const feed = useAdminNotifications();
  const now = useNow();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const source =
      filter === "all" || filter === "unread"
        ? feed.visible
        : feed.items.filter((item) => item.category === filter);
    return source.filter(
      (item) =>
        (filter !== "unread" || !feed.isRead(item.id)) &&
        words.every((word) =>
          `${item.title} ${item.description}`.toLowerCase().includes(word),
        ),
    );
  }, [feed, filter, query]);
  const mutedView =
    filter !== "all" && filter !== "unread" && feed.muted.includes(filter);

  return (
    <div className="ntf-page">
      <PageHeader
        eyebrow="Today"
        title="Notifications"
        description="Everything in the café that needs a decision, newest and most urgent first."
      >
        <button
          type="button"
          className="ops-button"
          onClick={() => void feed.refresh()}
          disabled={feed.refreshing}
        >
          <span className={feed.refreshing ? "ui-spin" : ""}>
            <Icon name="refresh" size={16} />
          </span>
          {feed.refreshing ? "Checking…" : "Refresh"}
        </button>
        <button
          type="button"
          className="ops-button primary"
          onClick={feed.markAllRead}
          disabled={!feed.unreadCount}
        >
          <Icon name="check" size={16} />
          Mark all read
        </button>
      </PageHeader>

      <div className="ntf-page-layout">
        <section className="ops-panel ntf-page-feed" aria-label="Notification list">
          <div className="ntf-page-toolbar">
            <div className="ntf-filters" role="group" aria-label="Show">
              {notificationFilters.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {filterLabel(value)}
                  {value === "unread" && feed.unreadCount > 0 && (
                    <span>{feed.unreadCount}</span>
                  )}
                </button>
              ))}
            </div>
            <label className="ntf-search">
              <Icon name="search" size={16} />
              <span className="sr-only">Search notifications</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search alerts"
              />
            </label>
          </div>
          <div className="ops-panel-legend">
            <ColorLegend
              items={[
                { tone: "danger", label: "Blocks service, act now" },
                { tone: "warning", label: "Needs a decision today" },
                { tone: "info", label: "Recent activity" },
              ]}
            />
          </div>
          {mutedView && (
            <p className="ntf-warning" role="status">
              <Icon name="alert" size={15} />
              <span>
                {categoryLabels[filter as NotificationCategory]} alerts are muted, so they
                are not counted on the bell.
              </span>
            </p>
          )}
          <div className="ntf-page-list" aria-busy={feed.loading}>
            {feed.loading && !feed.items.length ? (
              <NotificationSkeleton rows={6} />
            ) : shown.length ? (
              <NotificationGroups items={shown} />
            ) : (
              <NotificationEmpty
                filtered={filter !== "all" || Boolean(query.trim())}
                onReset={() => {
                  setFilter("all");
                  setQuery("");
                }}
              />
            )}
          </div>
        </section>

        <aside className="ntf-page-side">
          <section className="ops-panel ntf-summary" aria-label="Summary">
            <h2>At a glance</h2>
            <dl>
              <div>
                <dt>Unread</dt>
                <dd>{feed.loading ? "…" : feed.unreadCount}</dd>
              </div>
              <div>
                <dt>Urgent</dt>
                <dd className={feed.urgentUnread ? "is-urgent" : ""}>
                  {feed.loading ? "…" : feed.urgentUnread}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{feed.loading ? "…" : feed.visible.length}</dd>
              </div>
            </dl>
            <p className="ntf-checked">
              {feed.lastChecked
                ? `Checked ${relativeTime(feed.lastChecked, now).toLowerCase()} · updates arrive live`
                : "Waiting for the first check"}
            </p>
            {feed.failedSources.length > 0 && (
              <p className="ntf-warning" role="status">
                <Icon name="alert" size={15} />
                <span>
                  Could not check {feed.failedSources.join(", ")}.
                </span>
              </p>
            )}
          </section>

          <section className="ops-panel ntf-preferences" aria-label="Notification preferences">
            <h2>What counts on the bell</h2>
            <p className="ops-muted">
              Saved on this device for your account. Muted alerts stay listed
              here but stop counting.
            </p>
            <ul>
              {(Object.keys(categoryLabels) as NotificationCategory[]).map(
                (category) => {
                  const on = !feed.muted.includes(category);
                  return (
                    <li key={category}>
                      <div>
                        <strong>{categoryLabels[category]}</strong>
                        <small>{categoryHelp[category]}</small>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${categoryLabels[category]} alerts`}
                        className="ntf-switch"
                        onClick={() => feed.toggleMuted(category)}
                      >
                        <span />
                      </button>
                    </li>
                  );
                },
              )}
              <li>
                <div>
                  <strong>Pop-up for new urgent alerts</strong>
                  <small>A short message in the corner when something new needs you</small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={feed.popups}
                  aria-label="Pop-up for new urgent alerts"
                  className="ntf-switch"
                  onClick={() => feed.setPopups(!feed.popups)}
                >
                  <span />
                </button>
              </li>
            </ul>
            <p className="ntf-tip">
              <kbd>Shift</kbd> <kbd>N</kbd> opens notifications from any page.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
