"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useOrders } from "@cafeos/shared/hooks/useOrders";
import { supabase } from "@cafeos/shared/supabase/client";
import AppShell, { EmptyState, InlineNotice } from "../../../components/AppShell";
import { customerHeaders } from "../../../context/CustomerFeatures";
import { useCustomerToast } from "../../../context/CustomerToast";
import Icon from "../../../components/Icon";
import {
  MessageListSkeleton,
  Skeleton,
  SkeletonStatus,
} from "../../../components/Skeletons";
import {
  isUnread,
  offerUpdate,
  orderUpdate,
  readUpdateIds,
  saveUpdateIds,
  sortUpdates,
  timeAgo,
  type CustomerUpdate,
} from "../../../utils/customerUpdates";

const OFFER_DAYS = 21;
type Filter = "all" | "order" | "offer";

export default function NotificationsPage() {
  const { user, initialized } = useAuth();
  const owner = user?.id ?? "guest";
  const notify = useCustomerToast();
  const { orders, loading: ordersLoading } = useOrders({
    customerId: user?.id,
    enabled: initialized && !!user,
    includeCustomer: false,
    itemMode: "count",
    limit: 20,
  });
  const [guestOrders, setGuestOrders] = useState<typeof orders>([]);
  const [guestLoading, setGuestLoading] = useState(true);
  const [offers, setOffers] = useState<CustomerUpdate[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!initialized) return;
    void Promise.resolve().then(() => setRead(readUpdateIds(owner)));
  }, [initialized, owner]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const fetchGuest = useCallback(async () => {
    try {
      const ids = JSON.parse(
        localStorage.getItem("cafeos-guest-orders") ?? "[]",
      );
      if (!Array.isArray(ids) || !ids.length) {
        setGuestOrders([]);
        return;
      }
      const response = await fetch("/api/orders/guest", {
        method: "POST",
        headers: await customerHeaders(null),
        cache: "no-store",
        body: JSON.stringify({
          orderIds: ids.filter((id) => typeof id === "string").slice(-20),
        }),
      });
      const data = await response.json();
      if (response.ok) setGuestOrders(data.orders ?? []);
    } catch {
      // Guest updates simply stay as they were until the next check.
    } finally {
      setGuestLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!initialized || user) return;
    void Promise.resolve().then(fetchGuest);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchGuest();
    }, 15_000);
    return () => clearInterval(timer);
  }, [initialized, user, fetchGuest]);

  useEffect(() => {
    let active = true;
    const since = new Date(Date.now() - OFFER_DAYS * 86_400_000).toISOString();
    void supabase
      .from("vouchers")
      .select("id,code,description,discount_type,discount_value,created_at,valid_until")
      .eq("is_active", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!active) return;
        const live = (data ?? []).filter(
          (offer) => !offer.valid_until || Date.parse(offer.valid_until) >= Date.now(),
        );
        setOffers(live.map(offerUpdate));
        setOffersLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updates = useMemo(() => {
    const source = user ? orders : guestOrders;
    const fromOrders = source
      .map((order) => orderUpdate(order))
      .filter((update): update is CustomerUpdate => !!update);
    return sortUpdates([...fromOrders, ...offers]);
  }, [user, orders, guestOrders, offers]);
  const shown = updates.filter(
    (update) => filter === "all" || update.kind === filter,
  );
  const unread = updates.filter((update) => isUnread(update, read, now));
  const loading =
    !initialized || (user ? ordersLoading : guestLoading) || offersLoading;

  const persist = (next: Set<string>) => {
    setRead(next);
    saveUpdateIds(owner, next);
  };
  const markAll = () => {
    persist(new Set([...read, ...updates.map((update) => update.id)]));
    notify("All caught up.", { icon: "check" });
  };

  const fresh = shown.filter((update) => isUnread(update, read, now));
  const earlier = shown.filter((update) => !isUnread(update, read, now));

  return (
    <AppShell
      title="Notifications"
      eyebrow="Your updates"
      backHref="/account"
      actions={
        unread.length > 0 ? (
          <button type="button" className="text-link" onClick={markAll}>
            Mark all read
          </button>
        ) : undefined
      }
    >
      <div className="updates-layout">
        <section className="updates-feed" aria-label="Your updates">
          <div className="segmented-control updates-filter" role="group" aria-label="Show">
            {(["all", "order", "offer"] as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                className={filter === value ? "is-selected" : ""}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "All" : value === "order" ? "Orders" : "Offers"}
                {value === "all" && unread.length > 0 && (
                  <span className="updates-count">{unread.length}</span>
                )}
              </button>
            ))}
          </div>
          {loading && !updates.length ? (
            <MessageListSkeleton rows={4} label="Loading your updates" />
          ) : !shown.length ? (
            <EmptyState
              icon="bell"
              title={filter === "offer" ? "No new offers right now." : "Nothing new yet."}
              description={
                filter === "offer"
                  ? "Fresh vouchers from the café will show up here."
                  : "When you order, each step from confirmed to ready shows up here."
              }
              action={
                <Link href="/menu/browse" className="btn-primary">
                  Explore the menu
                </Link>
              }
            />
          ) : (
            <>
              {fresh.length > 0 && (
                <UpdateGroup
                  title="New"
                  updates={fresh}
                  read={read}
                  now={now}
                  onOpen={(id) => persist(new Set([...read, id]))}
                />
              )}
              {earlier.length > 0 && (
                <UpdateGroup
                  title="Earlier"
                  updates={earlier}
                  read={read}
                  now={now}
                  onOpen={(id) => persist(new Set([...read, id]))}
                />
              )}
            </>
          )}
          {!user && initialized && (
            <InlineNotice>
              Guest updates follow orders placed on this device.{" "}
              <Link href="/login" className="text-link">
                Sign in
              </Link>{" "}
              to see them anywhere.
            </InlineNotice>
          )}
        </section>
        <PushSettings />
      </div>
    </AppShell>
  );
}

function UpdateGroup({
  title,
  updates,
  read,
  now,
  onOpen,
}: {
  title: string;
  updates: CustomerUpdate[];
  read: Set<string>;
  now: number;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="updates-group" aria-label={title}>
      <h2 className="updates-group-title">{title}</h2>
      <ul className="updates-list jm-stagger">
        {updates.map((update) => {
          const unread = isUnread(update, read, now);
          return (
            <li key={update.id}>
              <Link
                href={update.href}
                className={`update-item tone-${update.tone}${unread ? " is-unread" : ""}`}
                onClick={() => onOpen(update.id)}
              >
                <span className="update-icon" aria-hidden="true">
                  <Icon name={update.icon} size={20} />
                </span>
                <span className="update-copy">
                  <strong>
                    {unread && <span className="sr-only">New: </span>}
                    {update.title}
                  </strong>
                  <span>{update.body}</span>
                  <small>
                    <time dateTime={update.at}>{timeAgo(update.at, now)}</time>
                  </small>
                </span>
                {unread && <span className="update-dot" aria-hidden="true" />}
                <Icon name="chevronRight" size={18} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Background alerts for this device: unchanged behaviour, clearer layout. */
function PushSettings() {
  const { user } = useAuth();
  const notify = useCustomerToast();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false),
    [config, setConfig] = useState<{
      configured: boolean;
      publicKey: string | null;
    } | null>(null),
    [orderId, setOrderId] = useState("");
  useEffect(() => {
    void fetch("/api/customer/push")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setMessage("Alert settings could not load."));
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .getRegistration()
        .then(async (r) =>
          setEnabled(!!(await r?.pushManager.getSubscription())),
        );
    queueMicrotask(() => {
      try {
        const ids = JSON.parse(
          localStorage.getItem("cafeos-guest-orders") ?? "[]",
        );
        if (Array.isArray(ids)) setOrderId(ids[0] ?? "");
      } catch {}
    });
  }, []);
  async function change() {
    setBusy(true);
    setMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "Install Jayds on your Home Screen on a supported device to enable alerts.",
        );
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg)
        throw new Error(
          "Install or reload the production app first. In-app order tracking is available.",
        );
      let sub = await reg.pushManager.getSubscription();
      if (enabled && sub) {
        const r = await fetch("/api/customer/push", {
          method: "DELETE",
          headers: await customerHeaders(user?.id ?? null),
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (!r.ok) throw new Error("The preference could not save.");
        await sub.unsubscribe();
        setEnabled(false);
        notify("Background alerts are off for this device.", { tone: "info" });
        return;
      }
      if (!config?.configured || !config.publicKey)
        throw new Error("Background alerts are not configured yet.");
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Permission was not granted. You can continue with in-app tracking.",
        );
      const key = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const r = await fetch("/api/customer/push", {
        method: "POST",
        headers: await customerHeaders(user?.id ?? null),
        body: JSON.stringify({ subscription: sub.toJSON(), orderId }),
      });
      const data = await r.json();
      if (!r.ok) {
        await sub.unsubscribe();
        throw new Error(data.error || "Alert preferences could not save.");
      }
      setEnabled(true);
      notify("Order alerts are on for this device.", { icon: "bell" });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Alerts could not update.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="surface-card updates-settings space-y-4 p-6">
      <div className="flex items-start gap-3">
        <span className="wallet-icon !h-11 !w-11 shrink-0" aria-hidden="true">
          <Icon name="bell" size={20} />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Alerts on this device</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Get a heads-up when your order is ready or the courier is on the
            way, even with the app closed. No marketing permission needed.
          </p>
        </div>
      </div>
      {!user && (
        <p className="text-sm">
          Guest alerts need an order placed on this device.
        </p>
      )}
      {config && !config.configured && (
        <InlineNotice>
          Background alerts are awaiting café configuration. In-app updates
          above still work.
        </InlineNotice>
      )}
      {config === null && !message ? (
        <SkeletonStatus label="Checking alert settings">
          <Skeleton shape="pill" height={48} />
        </SkeletonStatus>
      ) : (
        <button
          className={`${enabled ? "btn-secondary" : "btn-primary"} min-h-12 w-full jm-fade`}
          disabled={
            busy || (!enabled && !config?.configured) || (!enabled && !user && !orderId)
          }
          onClick={change}
        >
          {busy
            ? "Updating…"
            : enabled
              ? "Disable background alerts"
              : "Enable background alerts"}
        </button>
      )}
      {message && <InlineNotice>{message}</InlineNotice>}
      <details className="updates-install">
        <summary>How to install Jayds Café</summary>
        <p className="mt-2 text-sm leading-relaxed">
          On Android, choose “Install app” from your browser menu. On iPhone or
          iPad, open Jayds in Safari, tap Share, then Add to Home Screen. Open
          the installed app to turn on alerts.
        </p>
      </details>
    </section>
  );
}
