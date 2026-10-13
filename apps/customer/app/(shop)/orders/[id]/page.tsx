"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import { supabase } from "@cafeos/shared/supabase/client";
import type { Order, OrderStatus, CartItem } from "@cafeos/shared/types";
import { useCart } from "../../../../context/CartContext";
import { customerHeaders } from "../../../../context/CustomerFeatures";
import { buildReorderDraft } from "../../../../utils/orderReorder";
import AppShell, {
  EmptyState,
  InlineNotice,
} from "../../../../components/AppShell";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import Icon from "../../../../components/Icon";
import {
  readCustomerAttempt,
  clearCustomerAttempt,
} from "../../../../utils/checkoutAttempt";
import { cartLineId } from "../../../../utils/cartDraft";
import { cashAtPickup } from "@cafeos/shared/pos/fulfillment";

type CustomerOrder = Order & {
  pickup_qr?: string;
  cash_confirmation_qr?: string;
  pickup_window_start?: string | null;
  pickup_window_end?: string | null;
  preparation_due_at?: string | null;
  reconciliation_required?: boolean;
  payment_review_required?: boolean;
};
const steps: { status: OrderStatus; label: string }[] = [
  { status: "pending", label: "Order received" },
  { status: "confirmed", label: "Order confirmed" },
  { status: "preparing", label: "Being prepared" },
  { status: "ready", label: "Ready to collect" },
  { status: "completed", label: "Collected" },
];
const providerLabels: Record<string, string> = {
  ASSIGNING_DRIVER: "Finding a rider",
  ON_GOING: "Rider assigned",
  PICKED_UP: "Your rider has collected the order",
  COMPLETED: "Delivery completed",
  CANCELED: "Courier booking cancelled",
  CANCELLED: "Courier booking cancelled",
  REJECTED: "Courier booking rejected",
  EXPIRED: "Courier booking expired",
};
function safeTrackingLink(value: string | null | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" &&
      (url.hostname === "lalamove.com" ||
        url.hostname.endsWith(".lalamove.com"))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export default function OrderTrackingPage() {
  const { id } = useParams();
  const orderId = String(id);
  const search = useSearchParams();
  const router = useRouter();
  const { user, initialized } = useAuth();
  const ownerId = user?.id ?? null;
  const { menuItems } = useMenu();
  const cart = useCart();
  const [order, setOrder] = useState<CustomerOrder | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [actionError, setActionError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState<"payment" | "cancel" | "">(""),
    [verifying, setVerifying] = useState(false),
    [qr, setQr] = useState(""),
    [deliveryStatus, setDeliveryStatus] = useState(""),
    [cancelDialog, setCancelDialog] = useState(false),
    [reorder, setReorder] = useState<{
      items: CartItem[];
      issues: string[];
    } | null>(null);
  const handledReturn = useRef("");
  const requestVersion = useRef(0);
  const alive = useRef(true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!order || !cart.hydrated) return;
    const owner = user?.id ?? "guest";
    const attempt = readCustomerAttempt(owner);
    if (attempt?.orderId !== order.id) return;
    if (order.payment_status !== "paid" && order.status !== "cancelled") return;
    // Only remove the submitted draft. A newer bag must survive payment recovery.
    const lines = Array.isArray(attempt.payload.items)
      ? attempt.payload.items
      : [];
    const signature = (
      values: {
        menu_item_id: string;
        quantity: number;
        variants?: CartItem["variants"];
        notes?: string | null;
      }[],
    ) =>
      values
        .map(
          (i) =>
            `${cartLineId(i.menu_item_id, i.variants ?? [], i.notes ?? "")}:${i.quantity}`,
        )
        .sort()
        .join("|");
    const submitted = lines as {
      menu_item_id: string;
      quantity: number;
      variants?: CartItem["variants"];
      notes?: string | null;
    }[];
    if (
      order.payment_status === "paid" &&
      signature(cart.items) === signature(submitted)
    )
      queueMicrotask(cart.clearCart);
    clearCustomerAttempt(owner, order.payment_status === "paid");
  }, [order, user?.id, cart.hydrated, cart.items, cart.clearCart]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        headers: await customerHeaders(ownerId),
        cache: "no-store",
      });
      const data = await response.json();
      if (!alive.current || version !== requestVersion.current) return;
      if (!response.ok) throw new Error(data.error || "Order could not load.");
      setOrder(data.order);
      setError("");
    } catch (e) {
      if (alive.current && version === requestVersion.current)
        setError(e instanceof Error ? e.message : "Order could not load.");
    } finally {
      if (alive.current && version === requestVersion.current)
        setLoading(false);
    }
  }, [orderId, ownerId]);
  useEffect(() => {
    if (!initialized) return;
    let active = true;
    // Capture the ref object: cleanup must invalidate the latest counter,
    // including requests begun after this effect mounted.
    const versions = requestVersion;
    queueMicrotask(() => {
      if (!active) return;
      setOrder(null);
      setLoading(true);
      setVerifying(false);
      void refresh();
    });
    const update = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const poll = setInterval(update, 5000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    const channel = ownerId
      ? supabase
          .channel(`customer-order-${orderId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "orders",
              filter: `id=eq.${orderId}`,
            },
            update,
          )
          .subscribe()
      : null;
    return () => {
      active = false;
      versions.current++;
      clearInterval(poll);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [initialized, ownerId, orderId, refresh]);
  const qrData = order?.pickup_qr || order?.cash_confirmation_qr || "";
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setQr("");
    });
    if (qrData)
      void QRCode.toDataURL(qrData, {
        width: 240,
        margin: 3,
        color: { dark: "#402817", light: "#ffffff" },
        errorCorrectionLevel: "M",
      })
        .then((url) => {
          if (active) setQr(url);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [qrData]);
  const redirect = search.get("status") ?? search.get("payment");
  const returnState = search.get("mayaReturnState");
  useEffect(() => {
    if (
      (redirect !== "success" &&
        !(returnState && ["failed", "cancelled"].includes(redirect ?? ""))) ||
      !order?.maya_checkout_id ||
      order.payment_status === "paid" ||
      handledReturn.current === orderId
    )
      return;
    handledReturn.current = orderId;
    let active = true;
    const verify = async () => {
      setVerifying(true);
      try {
        for (let attempt = 0; attempt < 6 && active; attempt++) {
          const headers = await customerHeaders(ownerId);
          if (!active) return;
          const response = await fetch("/api/maya/verify", {
            method: "POST",
            headers,
            body: JSON.stringify({
              checkoutId: order.maya_checkout_id,
              returnState: returnState ?? undefined,
              returnOutcome: returnState ? redirect : undefined,
            }),
          });
          const result = await response.json();
          if (!active) return;
          if (!response.ok)
            throw new Error(result.error || "Payment is still being checked.");
          await refresh();
          if (!active) return;
          if (["paid", "failed", "refunded"].includes(result.paymentStatus))
            break;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      } catch (e) {
        if (active)
          setActionError(
            e instanceof Error ? e.message : "Payment could not be checked.",
          );
      } finally {
        if (active) {
          setVerifying(false);
          router.replace(`/orders/${orderId}`);
        }
      }
    };
    void Promise.resolve().then(() => {
      if (active) return verify();
    });
    return () => {
      active = false;
      // A cancelled setup (including Strict Mode's replay) must allow the
      // current owner to resume verification after loading the order again.
      if (handledReturn.current === orderId) handledReturn.current = "";
    };
    // The verification loop observes provider results itself. Payment updates must not abort its cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    redirect,
    returnState,
    order?.maya_checkout_id,
    orderId,
    ownerId,
    refresh,
    router,
  ]);
  const deliveryId = order?.order_type === "delivery" ? order.id : null;
  const bookingId = order?.lalamove_order_id;
  const fulfillmentStatus = order?.status;
  const storedDeliveryStatus = order?.lalamove_status;
  useEffect(() => {
    if (
      !deliveryId ||
      !bookingId ||
      ["completed", "cancelled"].includes(fulfillmentStatus ?? "")
    )
      return;
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (active) setDeliveryStatus(storedDeliveryStatus ?? "");
    });
    const update = async () => {
      if (!active || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const r = await fetch(`/api/lalamove/status?dbOrderId=${deliveryId}`, {
          headers: await customerHeaders(ownerId),
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await r.json();
        if (active && r.ok && typeof data.status === "string")
          setDeliveryStatus(data.status);
      } catch {
        /* The last confirmed status remains visible. */
      } finally {
        inFlight = false;
      }
    };
    void update();
    const timer = setInterval(() => void update(), 15000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [deliveryId, bookingId, fulfillmentStatus, storedDeliveryStatus, ownerId]);
  const pay = async () => {
    if (!order || busy) return;
    setBusy("payment");
    setActionError("");
    try {
      const r = await fetch("/api/maya/checkout", {
        method: "POST",
        headers: await customerHeaders(ownerId),
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await r.json();
      // The accepted attempt remains recoverable by its owner. A late response
      // must not hand its provider session to a different signed-in account.
      await customerHeaders(ownerId);
      if (!r.ok) throw new Error(data.error || "Payment could not start.");
      const url = new URL(data.redirectUrl);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !["maya.ph", "paymaya.com"].some(
          (domain) =>
            url.hostname === domain || url.hostname.endsWith(`.${domain}`),
        )
      )
        throw new Error("Payment link is unavailable.");
      window.location.assign(url.href);
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : "Could not connect to Maya. Your accepted order is retained.",
      );
    } finally {
      setBusy("");
    }
  };
  const cancel = async () => {
    if (!order || busy) return;
    setBusy("cancel");
    setActionError("");
    try {
      const r = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: await customerHeaders(ownerId),
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await r.json();
      await customerHeaders(ownerId);
      if (!r.ok)
        throw new Error(data.error || "The order could not be cancelled.");
      setCancelDialog(false);
      setFeedback(
        "Cancellation recorded. Any payment refund follows café review.",
      );
      await refresh();
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : "Cancellation could not be confirmed. Please refresh before retrying.",
      );
    } finally {
      setBusy("");
    }
  };
  const previewReorder = () => {
    if (!order) return;
    setReorder(buildReorderDraft(order, menuItems));
  };
  const acceptReorder = () => {
    if (!reorder?.items.length) return;
    for (const item of reorder.items) cart.addItem(item);
    setReorder(null);
    router.push("/cart");
  };
  if (loading)
    return (
      <AppShell title="Checking your order." backHref="/orders">
        <div className="space-y-4">
          <div className="skeleton h-36" />
          <div className="skeleton h-72" />
        </div>
      </AppShell>
    );
  if (!order)
    return (
      <AppShell title="Your order." backHref="/orders">
        <EmptyState
          icon="orders"
          title="Order access needed."
          description={
            error ||
            "Open this order in the browser that placed it, or sign in to its account. The café can help recover an older guest order."
          }
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button className="btn-secondary" onClick={() => void refresh()}>
                Retry
              </button>
              <Link className="btn-primary" href="/help">
                Get help
              </Link>
            </div>
          }
        />
      </AppShell>
    );
  const terminal = ["completed", "cancelled"].includes(order.status);
  const expired =
    !!order.expires_at &&
    Date.parse(order.expires_at) <= now &&
    order.payment_status !== "paid";
  const isDelivery = order.order_type === "delivery";
  const cashPickup = cashAtPickup(order);
  const tracking = safeTrackingLink(order.lalamove_share_link);
  const current = steps.findIndex((s) => s.status === order.status);
  const scheduled =
    order.pickup_window_start &&
    ["pending", "confirmed"].includes(order.status);
  const canPay =
    !terminal &&
    !expired &&
    order.payment_method === "maya" &&
    ["pending", "failed"].includes(order.payment_status);
  const canCancel =
    ["pending", "confirmed"].includes(order.status) &&
    order.payment_status !== "paid";
  return (
    <AppShell
      title={order.order_number}
      eyebrow={isDelivery ? "Delivery order" : "Pickup order"}
      backHref="/orders"
      actions={
        <span className={`status-pill status-${order.payment_status}`}>
          {order.payment_status === "pending"
            ? cashPickup
              ? "Pay at pickup"
              : "Unpaid"
            : order.payment_status === "paid"
              ? "Paid"
              : order.payment_status === "refunded"
                ? "Refunded"
                : "Payment failed"}
        </span>
      }
    >
      {error && (
        <InlineNotice>
          Live updates could not load. Your last confirmed order remains below.
          <button className="text-link ml-2" onClick={() => void refresh()}>
            Refresh
          </button>
        </InlineNotice>
      )}
      {actionError && <InlineNotice tone="error">{actionError}</InlineNotice>}
      {feedback && <InlineNotice tone="success">{feedback}</InlineNotice>}
      {verifying && (
        <InlineNotice>
          Checking your payment with Maya. A browser return message is not proof
          of payment.
        </InlineNotice>
      )}
      {canPay && !verifying && (
        <section className="wallet-strip mb-5">
          <span className="wallet-icon">
            <Icon name="wallet" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold">Finish your Maya payment</h2>
            <p className="mt-1 text-xs text-text-secondary">
              ₱{Number(order.total).toFixed(2)} due
              {order.expires_at
                ? ` · Deadline ${new Date(order.expires_at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}`
                : ""}
            </p>
          </div>
          <button
            className="btn-primary"
            disabled={!!busy}
            onClick={() => void pay()}
          >
            {busy === "payment" ? "Checking…" : "Pay now"}
          </button>
        </section>
      )}
      {expired && (
        <InlineNotice>
          This unpaid order’s payment deadline has passed. Do not pay through an
          old link; start a new order or contact the café if payment was already
          made.
        </InlineNotice>
      )}
      {(order.payment_review_required || order.reconciliation_required) && (
        <InlineNotice>
          The café needs to review a payment linked to this order. A payment
          received after cancellation or expiry does not restart the order.{" "}
          <Link href={`/help?order=${order.id}`} className="text-link">
            Contact the café
          </Link>
        </InlineNotice>
      )}
      {order.pickup_window_start && (
        <section className="wallet-strip mb-5">
          <span className="wallet-icon">
            <Icon name="clock" />
          </span>
          <div>
            <h2 className="font-semibold">
              {order.payment_status === "paid"
                ? "Your pickup window"
                : "Proposed pickup window"}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {new Date(order.pickup_window_start).toLocaleString("en-PH", {
                timeZone: "Asia/Manila",
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {order.pickup_window_end
                ? `–${new Date(order.pickup_window_end).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}`
                : ""}
            </p>
            {order.payment_status !== "paid" && (
              <p className="mt-1 text-xs text-text-secondary">
                Your booking is confirmed only after Maya verifies payment.
              </p>
            )}
          </div>
        </section>
      )}
      {order.status === "ready" &&
        !isDelivery &&
        (order.payment_status === "paid" ||
          (cashPickup && order.payment_status === "pending")) && (
          <InlineNotice tone="success">
            <strong>Your order is ready.</strong> Show your pickup QR at the
            café counter
            {cashPickup && order.payment_status === "pending"
              ? " and pay when you collect"
              : ""}
            .
          </InlineNotice>
        )}
      <div className="order-detail-grid">
        <div className="space-y-5">
          <section className="rounded-3xl border border-border bg-bg-card p-6">
            <h2 className="section-title mb-5">
              {scheduled && order.payment_status === "paid"
                ? "Scheduled for your visit"
                : "Order progress"}
            </h2>
            {order.status === "cancelled" ? (
              <p className="text-sm text-red-800">
                This order was cancelled. Any paid amount follows the café’s
                refund review.
              </p>
            ) : (
              <div>
                {steps.map((step, index) => {
                  const done = index < current,
                    active = index === current;
                  const history = order.status_history?.find(
                    (h) => h.new_status === step.status,
                  );
                  const label =
                    isDelivery && step.status === "ready"
                      ? "Ready for rider"
                      : isDelivery && step.status === "completed"
                        ? "Delivered"
                        : step.label;
                  return (
                    <div className="timeline-row" key={step.status}>
                      <div
                        className={`timeline-marker ${done ? "is-done" : active ? "is-current" : ""}`}
                      >
                        {done ? (
                          <Icon name="check" size={16} />
                        ) : (
                          <span className="text-xs">{index + 1}</span>
                        )}
                      </div>
                      {index < steps.length - 1 && (
                        <span className="timeline-line" />
                      )}
                      <div className="pb-6">
                        <p
                          className={`text-sm ${active ? "font-semibold" : "font-normal"}`}
                        >
                          {label}
                        </p>
                        {history && (
                          <p className="mt-1 text-xs text-text-secondary">
                            {new Date(history.created_at).toLocaleTimeString(
                              "en-PH",
                              {
                                timeZone: "Asia/Manila",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          {qr && (
            <section className="rounded-3xl border border-border bg-bg-card p-6 text-center">
              <h2 className="section-title">
                {cashPickup && order.payment_status === "pending"
                  ? "Pay & collect at the café"
                  : "Your pickup QR"}
              </h2>
              <img
                src={qr}
                alt={
                  order.cash_confirmation_qr
                    ? "Cash confirmation QR for cashier"
                    : "Pickup QR for collection"
                }
                width={240}
                height={240}
                className="mx-auto mt-4 rounded-2xl"
              />
              <p className="mt-4 text-sm text-text-secondary">
                {cashPickup && order.payment_status === "pending"
                  ? "Show this QR when you collect. The cashier records your cash payment and pickup together."
                  : "Show this code to staff to collect your paid, ready order."}
              </p>
            </section>
          )}
          {isDelivery && (
            <section className="rounded-3xl border border-border bg-bg-card p-6">
              <h2 className="section-title flex items-center gap-3">
                <Icon name="truck" />
                Delivery updates
              </h2>
              <p className="mt-4 text-sm text-text-secondary">
                {order.delivery_address}
              </p>
              <p className="mt-4 text-sm font-semibold">
                {deliveryStatus
                  ? (providerLabels[deliveryStatus] ?? "Courier status updated")
                  : order.lalamove_status
                    ? (providerLabels[order.lalamove_status] ??
                      "Courier status updated")
                    : "Awaiting café dispatch"}
              </p>
              {tracking && (
                <a
                  href={tracking}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary mt-4 w-full"
                >
                  Open official courier tracking
                  <Icon name="arrowRight" size={16} />
                </a>
              )}
              <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                Updates reflect confirmed courier events. Preparation readiness
                does not mean the rider has collected your order.
              </p>
            </section>
          )}
        </div>
        <div className="space-y-5">
          <section className="rounded-3xl border border-border bg-bg-card p-6">
            <h2 className="section-title mb-5">Your accepted ticket</h2>
            <p className="mb-4 text-sm font-semibold">{order.order_number}</p>
            <div className="space-y-5">
              {order.items?.map((item) => (
                <div key={item.id} className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">
                      {item.quantity} × {item.name}
                    </h3>
                    {item.variants?.length > 0 && (
                      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                        {item.variants.map((v) => v.label).join(" · ")}
                      </p>
                    )}
                    {item.notes && (
                      <p className="mt-2 text-xs text-text-secondary">
                        Note: {item.notes}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm">
                    ₱{Number(item.subtotal).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>₱{Number(order.subtotal).toFixed(2)}</dd>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between">
                  <dt>Discount</dt>
                  <dd>−₱{Number(order.discount).toFixed(2)}</dd>
                </div>
              )}
              {Number(order.delivery_fee) > 0 && (
                <div className="flex justify-between">
                  <dt>Delivery</dt>
                  <dd>₱{Number(order.delivery_fee).toFixed(2)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-4 text-lg font-semibold">
                <dt>Total</dt>
                <dd>₱{Number(order.total).toFixed(2)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-text-secondary">
              {order.payment_method === "maya" ? "Maya" : "Cash"} · Placed{" "}
              {new Date(order.created_at).toLocaleString("en-PH", {
                timeZone: "Asia/Manila",
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            {order.notes && (
              <p className="mt-4 rounded-xl bg-bg-primary p-3 text-xs text-text-secondary">
                {order.notes}
              </p>
            )}
            <button
              onClick={() => window.print()}
              type="button"
              className="text-link no-print"
            >
              Print accepted order
            </button>
          </section>
          <section className="space-y-3 no-print">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={previewReorder}
            >
              Review & order again
            </button>
            <Link
              href={`/help?order=${order.id}`}
              className="btn-secondary w-full"
            >
              Get help with this order
            </Link>
            {canCancel && (
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-red-200 text-sm font-semibold text-red-800"
                disabled={!!busy}
                onClick={() => setCancelDialog(true)}
              >
                Cancel unpaid order
              </button>
            )}
            {order.payment_status === "paid" &&
              ["pending", "confirmed"].includes(order.status) && (
                <Link
                  href={`/help?order=${order.id}&type=refund`}
                  className="text-link justify-center w-full"
                >
                  Request cancellation or refund review
                </Link>
              )}
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={cancelDialog}
        title="Cancel this unpaid order?"
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        busy={busy === "cancel"}
        onConfirm={() => void cancel()}
        onCancel={() => setCancelDialog(false)}
      >
        <p>
          Its stock reservation and any scheduled capacity will be released.
          Check the current order state if your payment was interrupted.
        </p>
        {actionError && (
          <p role="alert" className="mt-3 text-red-800">
            {actionError}
          </p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!reorder}
        title="Review your next order."
        confirmLabel={
          cart.items.length ? "Add to my bag" : "Add reviewed items"
        }
        cancelLabel="Keep browsing"
        disabled={!reorder?.items.length}
        onConfirm={acceptReorder}
        onCancel={() => setReorder(null)}
      >
        <p>
          {cart.items.length
            ? "Your existing bag is kept. Reviewed items will be added alongside it."
            : "This creates a new draft with today’s menu and prices."}
        </p>
        {reorder?.issues.length ? (
          <ul className="mt-4 list-disc space-y-2 pl-5">
            {reorder.issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3">
            Your previous configurations still match the current menu.
          </p>
        )}
        <p className="mt-4 font-semibold">
          {reorder?.items.reduce((n, item) => n + item.quantity, 0) ?? 0} items
          · ₱
          {(
            reorder?.items.reduce(
              (n, item) => n + item.price * item.quantity,
              0,
            ) ?? 0
          ).toFixed(2)}
        </p>
        <p className="mt-2 text-xs">
          Availability and final pricing are confirmed online at checkout.
        </p>
      </ConfirmDialog>
    </AppShell>
  );
}
