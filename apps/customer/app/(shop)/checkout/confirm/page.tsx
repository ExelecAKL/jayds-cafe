"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useCart } from "../../../../context/CartContext";
import { customerHeaders } from "../../../../context/CustomerFeatures";
import AppShell, { InlineNotice } from "../../../../components/AppShell";
import {
  readCustomerAttempt,
  saveCustomerAttempt,
  clearCustomerAttempt,
  type CustomerAttempt,
} from "../../../../utils/checkoutAttempt";
import { LEGAL_VERSION } from "../../../../lib/legal";
import { createUuid } from "@cafeos/shared/utils/uuid";
import { safeMayaCheckoutUrl } from "@cafeos/shared/maya-urls";
import type { PaymentQuote } from "@cafeos/shared/finance/quote";
import TicketItemImage from "../../../../components/TicketItemImage";
import OrderCountdown from "../../../../components/OrderCountdown";
import OrderPoints from "../../../../components/OrderPoints";
interface Review {
  owner: string;
  paymentMethod: string;
  pointsToRedeem: number;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryFee: number;
  deliveryQuoteToken: string;
  recipientName: string;
  recipientPhone: string;
  pickupSlotStart: string | null;
  legalVersion: string;
  financialQuote?: PaymentQuote;
}
export default function ConfirmOrderPage() {
  const { user, profile, initialized } = useAuth(),
    cart = useCart(),
    router = useRouter(),
    lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [review, setReview] = useState<Review | null>(null),
    [attempt, setAttempt] = useState<CustomerAttempt | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const [countdown, setCountdown] = useState(false);
  const owner = user?.id ?? "guest";
  useEffect(() => {
    if (!initialized) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const existing = readCustomerAttempt(owner);
      setAttempt(existing);
      try {
        const r = JSON.parse(
          sessionStorage.getItem("checkout_confirm") ?? "null",
        );
        if (r?.owner === owner && r.legalVersion === LEGAL_VERSION)
          setReview(r);
        else if (!existing) router.replace("/checkout");
      } catch {
        if (!existing) router.replace("/checkout");
      }
    });
    return () => {
      active = false;
    };
  }, [owner, initialized, router]);
  const currentTotal =
    Math.round(
      (cart.total -
        (review?.pointsToRedeem ?? 0) / 10 +
        (cart.orderType === "delivery" ? (review?.deliveryFee ?? 0) : 0)) *
        100,
    ) / 100;
  const total = Number(attempt?.payload.total ?? currentTotal);
  const breakdown =
    review?.financialQuote?.total === Math.round(total * 100)
      ? review.financialQuote.breakdown
      : null;
  async function place() {
    if (lock.current || !initialized || (!review && !attempt)) return;
    if (!navigator.onLine) {
      setError("Reconnect to confirm this sale. Your ticket is saved.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      let pending = attempt;
      if (!pending) {
        const r = review!,
          cash = cart.orderType === "pickup" && r.paymentMethod === "cash";
        const hash = cash
          ? Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
              b.toString(16).padStart(2, "0"),
            ).join("")
          : null;
        pending = {
          owner,
          key: createUuid(),
          createdAt: new Date().toISOString(),
          payload: {
            order_type: cart.orderType,
            payment_method: r.paymentMethod,
            subtotal: cart.subtotal,
            total: currentTotal,
            discount: cart.discount + r.pointsToRedeem / 10,
            points_redeemed: r.pointsToRedeem,
            points_earned: 0,
            notes:
              [cart.orderNote, cart.specialRemarks]
                .filter(Boolean)
                .join(" | ") || null,
            voucher_code: cart.voucher?.code ?? null,
            pickup_confirmation_hash: hash,
            advance_order_key: cash ? createUuid() : null,
            expires_at: new Date(Date.now() + 1800000).toISOString(),
            pickup_slot_start: r.pickupSlotStart,
            legal_version: LEGAL_VERSION,
            legal_acknowledged: true,
            ...(cart.orderType === "delivery"
              ? {
                  delivery_name: r.recipientName,
                  delivery_phone: r.recipientPhone,
                  delivery_address: r.deliveryAddress,
                  delivery_lat: r.deliveryLat,
                  delivery_lng: r.deliveryLng,
                  delivery_fee: r.deliveryFee,
                  delivery_quote_token: r.deliveryQuoteToken,
                }
              : {}),
            items: cart.items.map((i) => ({
              menu_item_id: i.menu_item_id,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              variants: i.variants,
              subtotal: Math.round(i.price * i.quantity * 100) / 100,
              notes: i.notes,
            })),
          },
        };
        saveCustomerAttempt(pending);
        setAttempt(pending);
      }
      const headers = await customerHeaders(user?.id ?? null);
      if (!pending.orderId) {
        const response = await fetch("/api/orders/create", {
          method: "POST",
          headers: { ...headers, "Idempotency-Key": pending.key },
          body: JSON.stringify(pending.payload),
          signal: AbortSignal.timeout(20000),
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 400 || response.status === 409) {
            setConflict(true);
            clearCustomerAttempt(owner);
            setAttempt(null);
          }
          throw new Error(data.error || "Order confirmation failed.");
        }
        if (!data.id)
          throw new Error(
            "No confirmation was returned. Retry to recover the same order.",
          );
        pending = {
          ...pending,
          orderId: data.id,
          orderNumber: data.order_number,
        };
        saveCustomerAttempt(pending);
        setAttempt(pending);
        if (!user) {
          try {
            const ids = JSON.parse(
              localStorage.getItem("cafeos-guest-orders") ?? "[]",
            );
            localStorage.setItem(
              "cafeos-guest-orders",
              JSON.stringify(
                [
                  ...new Set([data.id, ...(Array.isArray(ids) ? ids : [])]),
                ].slice(0, 20),
              ),
            );
          } catch {}
        }
      }
      // Preserve the canonical result for this owner even if they navigate or
      // switch accounts; never redirect or clear the new account's draft.
      if (!mounted.current) return;
      if (pending.payload.payment_method === "maya") {
        const response = await fetch("/api/maya/checkout", {
          method: "POST",
          headers,
          body: JSON.stringify({ orderId: pending.orderId }),
          signal: AbortSignal.timeout(20000),
        });
        const data = await response.json();
        if (!response.ok || !data.redirectUrl)
          throw new Error(
            data.error ||
              "Payment setup needs review. Your accepted order is saved.",
          );
        const destination = safeMayaCheckoutUrl(data.redirectUrl);
        if (!destination)
          throw new Error(
            "Payment redirect could not be verified. Open your order for help.",
          );
        if (mounted.current) window.location.assign(destination);
        return;
      }
      clearCustomerAttempt(owner, true);
      cart.clearCart();
      router.replace("/orders/" + pending.orderId);
    } catch (e) {
      setError(
        e instanceof Error && ["TimeoutError", "TypeError"].includes(e.name)
          ? "We couldn’t confirm your order. Keep this page open and retry to check for the same order."
          : e instanceof Error
            ? e.message
            : "Confirmation is uncertain. Retry to recover the same result.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const lines = attempt?.payload.items as
    | {
        menu_item_id: string;
        image_url?: string | null;
        name: string;
        quantity: number;
        price: number;
        variants: { label: string }[];
        notes?: string;
      }[]
    | undefined;
  return (
    <AppShell
      title="Review your order"
      description="Nothing is submitted until you confirm."
      backHref="/checkout"
    >
      <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_320px]">
        <section className="surface-card space-y-4 p-5">
          <h2 className="text-xl font-semibold">Your order</h2>
          {(lines?.length || cart.items.length) > 0 && (
            <OrderPoints
              total={Math.max(0, total)}
              member={!!user}
              tier={profile?.loyalty_tier}
            />
          )}
          {(lines ?? cart.items).map((i, index) => (
            <div
              key={index}
              className="flex justify-between gap-4 border-b border-border pb-4"
            >
              <TicketItemImage
                menuItemId={i.menu_item_id}
                imageUrl={
                  i.image_url ??
                  cart.items.find(
                    (line) => line.menu_item_id === i.menu_item_id,
                  )?.image_url
                }
                name={i.name}
              />
              <div className="min-w-0 flex-1">
                <strong>
                  {i.quantity} × {i.name}
                </strong>
                <p className="text-sm text-text-muted">
                  {i.variants.map((v) => v.label).join(" · ")}
                </p>
                {i.notes && <p className="text-sm">{i.notes}</p>}
              </div>
              <span>₱{(i.price * i.quantity).toFixed(2)}</span>
            </div>
          ))}
          {(attempt?.payload.notes ?? cart.orderNote) && (
            <p className="checkout-order-note">
              <strong>Order note</strong>
              <span>{String(attempt?.payload.notes ?? cart.orderNote)}</span>
            </p>
          )}
          <p className="text-sm">
            {String(
              attempt?.payload.order_type ?? cart.orderType,
            ).toUpperCase()}{" "}
            ·{" "}
            {String(
              attempt?.payload.payment_method ?? review?.paymentMethod ?? "",
            ).toUpperCase()}
          </p>
          {review?.pickupSlotStart && (
            <p>
              Pickup{" "}
              {new Date(review.pickupSlotStart).toLocaleString("en-PH", {
                timeZone: "Asia/Manila",
              })}
            </p>
          )}
          {review?.deliveryAddress && (
            <p className="text-sm">{review.deliveryAddress}</p>
          )}
          <p className="text-xs text-text-muted">
            Prices, stock and eligible rewards are checked when you place your
            order. Pay before the reservation deadline shown on your accepted
            order.
          </p>
        </section>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="surface-card p-5">
            <p className="text-sm text-text-muted">Amount due</p>
            <p className="text-4xl font-semibold">
              ₱{Math.max(0, total).toFixed(2)}
            </p>
            {breakdown && (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt>Product sales excluding VAT</dt>
                  <dd>₱{(breakdown.net_sales / 100).toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Product VAT (included)</dt>
                  <dd>₱{(breakdown.vat / 100).toFixed(2)}</dd>
                </div>
                {breakdown.delivery > 0 && (
                  <div className="flex justify-between">
                    <dt>Delivery</dt>
                    <dd>₱{(breakdown.delivery / 100).toFixed(2)}</dd>
                  </div>
                )}
              </dl>
            )}
          </section>
          {review?.paymentMethod === "cash" && (
            <p className="text-sm text-text-secondary">
              Pay at pickup. The café prepares your accepted order; show its
              ready pickup QR and pay the cashier when you collect.
            </p>
          )}
          {attempt?.orderId && (
            <InlineNotice>
              Order {attempt.orderNumber} is accepted. Continue its payment or{" "}
              <Link href={"/orders/" + attempt.orderId} className="underline">
                open the order
              </Link>
              .
            </InlineNotice>
          )}
          <div className="checkout-action">
            {error && <InlineNotice tone="error">{error}</InlineNotice>}
            {conflict && (
              <Link className="btn-secondary w-full" href="/checkout">
                Review changes
              </Link>
            )}
            <div className="portrait-only checkout-action-total">
              <small>Amount due</small>
              <strong>₱{Math.max(0, total).toFixed(2)}</strong>
            </div>
            <button
              className="btn-primary min-h-14 w-full"
              disabled={
                busy ||
                (!review && !attempt) ||
                (!cart.items.length && !attempt)
              }
              onClick={() => {
                if (attempt) void place();
                else setCountdown(true);
              }}
            >
              {busy
                ? "Confirming…"
                : attempt?.orderId
                  ? "Continue payment"
                  : attempt
                    ? "Recover confirmation"
                    : "Place order"}
            </button>
          </div>
          <p className="text-xs text-text-muted">
            If your connection drops, keep this page open and retry. We’ll check
            for your existing order.
          </p>
        </aside>
      </div>
      {countdown && (
        <OrderCountdown
          onCancel={() => setCountdown(false)}
          onComplete={() => {
            setCountdown(false);
            void place();
          }}
        />
      )}
    </AppShell>
  );
}
