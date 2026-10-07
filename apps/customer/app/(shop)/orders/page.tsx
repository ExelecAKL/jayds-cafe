"use client";
import { cashAtPickup } from "@cafeos/shared/pos/fulfillment";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useOrders } from "@cafeos/shared/hooks/useOrders";
import type { Order } from "@cafeos/shared/types";
import { customerHeaders } from "../../../context/CustomerFeatures";
import AppShell, {
  EmptyState,
  InlineNotice,
} from "../../../components/AppShell";
import Icon from "../../../components/Icon";

type DisplayOrder = Order & {
  pickup_window_start?: string | null;
  pickup_window_end?: string | null;
};
const statusLabels: Record<string, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};
export default function OrdersPage() {
  const { user, initialized } = useAuth();
  const { orders, loading, error, refetch } = useOrders({
    customerId: user?.id,
    enabled: initialized && !!user,
    includeCustomer: false,
    includeStatusHistory: false,
    itemMode: "full",
  });
  const [guestOrders, setGuestOrders] = useState<DisplayOrder[]>([]),
    [guestLoading, setGuestLoading] = useState(true),
    [guestError, setGuestError] = useState(""),
    [view, setView] = useState<"active" | "history">("active");
  const fetchGuest = useCallback(async () => {
    try {
      const ids = JSON.parse(
        localStorage.getItem("cafeos-guest-orders") ?? "[]",
      );
      if (!Array.isArray(ids) || !ids.length) {
        setGuestOrders([]);
        return;
      }
      const r = await fetch("/api/orders/guest", {
        method: "POST",
        headers: await customerHeaders(null),
        cache: "no-store",
        body: JSON.stringify({
          orderIds: ids.filter((id) => typeof id === "string").slice(-20),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Guest orders could not load.");
      setGuestOrders(data.orders ?? []);
      setGuestError("");
    } catch (e) {
      setGuestError(e instanceof Error ? e.message : "Orders could not load.");
    } finally {
      setGuestLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!initialized || user) return;
    void Promise.resolve().then(fetchGuest);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchGuest();
    }, 10000);
    window.addEventListener("online", fetchGuest);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", fetchGuest);
    };
  }, [initialized, user, fetchGuest]);
  const all: DisplayOrder[] = user ? orders : guestOrders;
  const active = all.filter(
    (order) => !["completed", "cancelled"].includes(order.status),
  );
  const history = all.filter((order) =>
    ["completed", "cancelled"].includes(order.status),
  );
  const list = view === "active" ? active : history;
  const isLoading = !initialized || (user ? loading : guestLoading);
  const message = user ? error : guestError;
  return (
    <AppShell
      title="Your coffee journey."
      mobileTitle="My orders"
      eyebrow="My orders"
      actions={
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh orders"
          onClick={() => {
            if (user) void refetch();
            else void fetchGuest();
          }}
        >
          <Icon name="clock" />
        </button>
      }
    >
      {!user && initialized && (
        <InlineNotice>
          Your guest orders are available on this browser while its secure
          access is retained.{" "}
          <Link href="/login" className="text-link">
            Sign in for account history
          </Link>
        </InlineNotice>
      )}
      <div className="segmented-control mb-6">
        <button
          type="button"
          className={view === "active" ? "is-selected" : ""}
          aria-pressed={view === "active"}
          onClick={() => setView("active")}
        >
          Active {active.length > 0 && `(${active.length})`}
        </button>
        <button
          type="button"
          className={view === "history" ? "is-selected" : ""}
          aria-pressed={view === "history"}
          onClick={() => setView("history")}
        >
          History
        </button>
      </div>
      {message && <InlineNotice tone="error">{message}</InlineNotice>}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div className="skeleton h-36 rounded-3xl" key={i} />
          ))}
        </div>
      ) : !list.length ? (
        <EmptyState
          icon="orders"
          title={
            view === "active"
              ? "Nothing brewing yet."
              : "Your routine starts here."
          }
          description={
            view === "active"
              ? "When you place an order, its progress and pickup details will appear here."
              : "Completed and cancelled orders appear here. Open a completed order to review it or order again."
          }
          action={
            <Link href="/menu/browse" className="btn-primary">
              Explore the menu
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((order) => {
            const label =
              order.pickup_window_start &&
              order.payment_status === "paid" &&
              ["pending", "confirmed"].includes(order.status)
                ? "Scheduled"
                : (statusLabels[order.status] ?? order.status);
            const count =
              order.items?.reduce(
                (sum, item) => sum + (Number(item.quantity) || 1),
                0,
              ) ?? 0;
            return (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="order-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">
                      {order.order_type === "delivery" ? "Delivery" : "Pickup"}{" "}
                      ·{" "}
                      {order.order_source === "pos"
                        ? "Café counter"
                        : "App order"}
                    </p>
                    <h2 className="font-display text-3xl font-semibold tracking-tight">
                      {order.order_number}
                    </h2>
                  </div>
                  <span className={`status-pill status-${order.status}`}>
                    {label}
                  </span>
                </div>
                {order.pickup_window_start && (
                  <p className="mt-3 flex items-center gap-2 text-sm">
                    <Icon name="clock" size={17} />
                    Pickup{" "}
                    {new Date(order.pickup_window_start).toLocaleString(
                      "en-PH",
                      {
                        timeZone: "Asia/Manila",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}
                  </p>
                )}
                <p className="mt-3 text-xs text-text-secondary">
                  Placed{" "}
                  {new Date(order.created_at).toLocaleString("en-PH", {
                    timeZone: "Asia/Manila",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-text-secondary">
                      {count} item{count === 1 ? "" : "s"}
                    </span>
                    <span
                      className={`status-pill status-${order.payment_status}`}
                    >
                      {order.payment_status === "pending"
                        ? cashAtPickup(order)
                          ? "Pay at pickup"
                          : "Unpaid"
                        : order.payment_status === "paid"
                          ? "Paid"
                          : order.payment_status === "refunded"
                            ? "Refunded"
                            : "Payment failed"}
                    </span>
                  </div>
                  <span className="text-base font-semibold">
                    ₱{Number(order.total).toFixed(2)}
                  </span>
                  <Icon name="chevronRight" size={18} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
