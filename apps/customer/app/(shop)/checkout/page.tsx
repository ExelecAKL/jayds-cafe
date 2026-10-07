"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { supabase } from "@cafeos/shared/supabase/client";
import {
  manilaDate,
  tomorrowManilaDate,
  formatPickupWindow,
} from "@cafeos/shared/customer/scheduling";
import type { PickupSlot } from "@cafeos/shared/customer/types";
import { useCart } from "../../../context/CartContext";
import { customerHeaders } from "../../../context/CustomerFeatures";
import AppShell, { InlineNotice } from "../../../components/AppShell";
import DeliveryMapPickerLazy from "../../../components/DeliveryMapPickerLazy";
import LegalReview from "../../../components/LegalReview";
import { LEGAL_VERSION } from "../../../lib/legal";
interface Destination {
  lat: number;
  lng: number;
  address: string;
  label?: string;
}
interface Quote {
  quoteToken: string;
  deliveryFee: number;
  expiresAt: string;
  quotationId: string;
}
const php = (n: number) => "₱" + n.toFixed(2);
export default function CheckoutPage() {
  const cart = useCart(),
    { user, profile, initialized } = useAuth(),
    router = useRouter();
  const [paymentMethod, setPayment] = useState("cash"),
    [destination, setDestination] = useState<Destination | null>(null),
    [quote, setQuote] = useState<Quote | null>(null),
    [quoting, setQuoting] = useState(false),
    [mapOpen, setMapOpen] = useState(false);
  const [addresses, setAddresses] = useState<Destination[]>([]),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [points, setPoints] = useState(""),
    [voucherCode, setVoucherCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [legalReady, setLegalReady] = useState(false);
  const [schedule, setSchedule] = useState(false),
    [slot, setSlot] = useState(""),
    [slots, setSlots] = useState<PickupSlot[]>([]),
    [slotReason, setSlotReason] = useState(""),
    [branch, setBranch] = useState({
      name: "Jayds Café",
      latitude: 14.346621,
      longitude: 120.981057,
    });
  const [date, setDate] = useState(manilaDate()),
    quoteVersion = useRef(0);
  const owner = user?.id ?? "guest";
  const [formOwner, setFormOwner] = useState<string | null>(null);
  const delivery = cart.orderType === "delivery",
    maxPoints = Math.min(profile?.points ?? 0, Math.floor(cart.total * 10)),
    redeemed = Math.min(
      maxPoints,
      Math.max(0, Math.floor(Number(points) || 0)),
    );
  const total =
    Math.round(
      (Math.max(0, cart.total - redeemed / 10) +
        (delivery ? (quote?.deliveryFee ?? 0) : 0)) *
        100,
    ) / 100;
  const legalCallback = useCallback(
    (ready: boolean) => setLegalReady(ready),
    [],
  );
  useEffect(() => {
    void fetch("/api/branch")
      .then((r) => r.json())
      .then((b) => {
        if (b.name) setBranch(b);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!initialized) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      let saved: Record<string, unknown> = {};
      try {
        saved = JSON.parse(
          sessionStorage.getItem("jayds-checkout-form:" + owner) ?? "{}",
        );
      } catch {}
      setName(
        typeof saved.name === "string"
          ? saved.name
          : (profile?.full_name ?? ""),
      );
      setPhone(
        typeof saved.phone === "string" ? saved.phone : (profile?.phone ?? ""),
      );
      const dest = saved.destination as Destination | undefined;
      setDestination(
        dest &&
          Number.isFinite(dest.lat) &&
          Number.isFinite(dest.lng) &&
          typeof dest.address === "string"
          ? dest
          : null,
      );
      setPoints(typeof saved.points === "string" ? saved.points : "");
      setPayment(saved.paymentMethod === "maya" ? "maya" : "cash");
      setSchedule(saved.schedule === true);
      setFormOwner(owner);
      setQuote(null);
      setAddresses([]);
      if (!user) return;
      void supabase
        .from("saved_addresses")
        .select("label,address,lat,lng")
        .eq("user_id", user.id)
        .then(({ data, error }) => {
          if (!active) return;
          if (error)
            setError(
              "Saved addresses could not load. Choose a destination manually.",
            );
          else setAddresses(data ?? []);
        });
    });
    return () => {
      active = false;
    };
    // Initialize once per account. A profile refresh must not erase an entered checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, owner]);
  useEffect(() => {
    if (formOwner !== owner) return;
    try {
      sessionStorage.setItem(
        "jayds-checkout-form:" + owner,
        JSON.stringify({
          name,
          phone,
          destination,
          points,
          paymentMethod,
          schedule,
        }),
      );
    } catch {}
  }, [
    formOwner,
    owner,
    name,
    phone,
    destination,
    points,
    paymentMethod,
    schedule,
  ]);
  useEffect(() => {
    queueMicrotask(() => {
      if (delivery || schedule) setPayment("maya");
    });
  }, [delivery, schedule]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setSlot("");
      if (!schedule || delivery) return;
      void fetch(
        "/api/pickup/slots?date=" + date + "&item_units=" + cart.itemCount,
        { signal: controller.signal, cache: "no-store" },
      )
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Pickup windows unavailable.");
          if (controller.signal.aborted) return;
          setSlots(d.slots ?? []);
          setSlotReason(
            d.reason ||
              (!d.enabled ? "Scheduled pickup is not enabled yet." : ""),
          );
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setSlots([]);
            setSlotReason(e.message);
          }
        });
    });
    return () => controller.abort();
  }, [schedule, delivery, date, cart.itemCount]);
  useEffect(() => {
    const version = ++quoteVersion.current,
      controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setQuote(null);
      if (!destination || !delivery) return;
      setQuoting(true);
      setError("");
      void customerHeaders(user?.id ?? null)
        .then((headers) =>
          fetch("/api/lalamove/quotation", {
            method: "POST",
            headers,
            body: JSON.stringify({
              dropoffLat: destination.lat,
              dropoffLng: destination.lng,
              dropoffAddress: destination.address,
            }),
            signal: controller.signal,
          }),
        )
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok)
            throw new Error(d.error || "Delivery quotation unavailable.");
          if (version === quoteVersion.current) setQuote(d);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (version === quoteVersion.current) setQuoting(false);
        });
    });
    return () => controller.abort();
  }, [destination, delivery, user]);
  async function applyVoucher() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: await customerHeaders(user?.id ?? null),
        body: JSON.stringify({
          code: voucherCode.trim(),
          subtotal: cart.subtotal,
          itemIds: cart.items.map((i) => i.menu_item_id),
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Voucher unavailable.");
      cart.applyVoucher(d);
      setVoucherCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voucher could not apply.");
    } finally {
      setBusy(false);
    }
  }
  function review() {
    setError("");
    if (!navigator.onLine) {
      setError("Reconnect to confirm your order. Your draft is saved.");
      return;
    }
    if (
      delivery &&
      (!destination ||
        !quote ||
        Date.parse(quote.expiresAt) <= Date.now() ||
        !name.trim() ||
        !/^\+?[0-9 ()-]{10,20}$/.test(phone))
    ) {
      setError(
        "Choose a destination, recipient and valid phone number, then refresh the quotation.",
      );
      return;
    }
    if (schedule && !delivery && !slot) {
      setError("Choose an available pickup window.");
      return;
    }
    if (!legalReady) {
      setError("Review the Terms and Privacy Notice.");
      return;
    }
    try {
      sessionStorage.setItem(
        "checkout_confirm",
        JSON.stringify({
          owner: user?.id ?? "guest",
          paymentMethod: delivery || schedule ? "maya" : paymentMethod,
          pointsToRedeem: redeemed,
          redeemPoints: redeemed > 0,
          deliveryAddress: destination?.address ?? "",
          deliveryLat: destination?.lat ?? null,
          deliveryLng: destination?.lng ?? null,
          deliveryFee: quote?.deliveryFee ?? 0,
          deliveryQuotationId: quote?.quotationId ?? "",
          deliveryQuoteToken: quote?.quoteToken ?? "",
          deliveryQuoteExpiry: quote?.expiresAt ?? "",
          recipientName: name.trim(),
          recipientPhone: phone.trim(),
          pickupSlotStart: !delivery && schedule ? slot : null,
          legalVersion: LEGAL_VERSION,
        }),
      );
      router.push("/checkout/confirm");
    } catch {
      setError("Enable browser storage to preserve this checkout safely.");
    }
  }
  return (
    <AppShell
      title="Checkout"
      description="Made your way. Confirmed securely."
      backHref="/cart"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="surface-card p-5">
            <h2 className="text-xl font-semibold">
              How would you like your order?
            </h2>
            <p className="mb-4 text-sm text-text-muted">
              {branch.name} · Pickup is available wherever you are.
            </p>
            <div className="segmented-control">
              <button
                className={!delivery ? "is-selected" : ""}
                onClick={() => cart.setOrderType("pickup")}
              >
                Pickup
              </button>
              <button
                className={delivery ? "is-selected" : ""}
                onClick={() => cart.setOrderType("delivery")}
              >
                Delivery
              </button>
            </div>
            {!delivery && (
              <div className="mt-4 space-y-3">
                <div className="segmented-control">
                  <button
                    className={!schedule ? "is-selected" : ""}
                    onClick={() => setSchedule(false)}
                  >
                    As soon as possible
                  </button>
                  <button
                    className={schedule ? "is-selected" : ""}
                    onClick={() => setSchedule(true)}
                  >
                    Schedule pickup
                  </button>
                </div>
                {schedule && (
                  <>
                    <label className="block text-sm">
                      Pickup date
                      <select
                        className="input-field mt-1 w-full"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      >
                        <option value={manilaDate()}>Today</option>
                        <option value={tomorrowManilaDate()}>Tomorrow</option>
                      </select>
                    </label>
                    {slotReason && <InlineNotice>{slotReason}</InlineNotice>}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {slots.map((s) => (
                        <button
                          key={s.start}
                          className={
                            "btn-secondary min-h-12 " +
                            (slot === s.start ? "ring-2 ring-accent" : "")
                          }
                          disabled={
                            s.remaining_orders <= 0 ||
                            s.remaining_item_units < cart.itemCount
                          }
                          onClick={() => setSlot(s.start)}
                        >
                          {new Date(s.start).toLocaleTimeString("en-PH", {
                            timeZone: "Asia/Manila",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </button>
                      ))}
                    </div>
                    {slot && (
                      <p className="text-sm">
                        {formatPickupWindow(
                          slot,
                          new Date(Date.parse(slot) + 900000).toISOString(),
                        )}
                      </p>
                    )}
                    <p className="text-xs text-text-muted">
                      15-minute windows · Maya prepayment. Availability is
                      confirmed when you place the order.
                    </p>
                  </>
                )}
              </div>
            )}
            {delivery && (
              <div className="mt-4 space-y-3">
                {addresses.length > 0 && (
                  <label className="block text-sm">
                    Saved destination
                    <select
                      className="input-field w-full"
                      value=""
                      onChange={(e) => {
                        const a = addresses[Number(e.target.value)];
                        if (a) setDestination(a);
                      }}
                    >
                      <option value="">Choose saved address</option>
                      {addresses.map((a, i) => (
                        <option key={i} value={i}>
                          {a.label} · {a.address}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  className="btn-secondary min-h-12 w-full"
                  onClick={() => setMapOpen(true)}
                >
                  {destination
                    ? "Change destination"
                    : "Choose destination on map"}
                </button>
                {destination && (
                  <p className="text-sm">{destination.address}</p>
                )}
                <label className="block text-sm">
                  Recipient name
                  <input
                    autoComplete="name"
                    className="input-field mt-1 w-full"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                  />
                </label>
                <label className="block text-sm">
                  Recipient phone
                  <input
                    type="tel"
                    autoComplete="tel"
                    className="input-field mt-1 w-full"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={20}
                  />
                </label>
                <p role="status" className="text-sm">
                  {quoting
                    ? "Calculating delivery fee…"
                    : quote
                      ? "Delivery " + php(quote.deliveryFee)
                      : "Choose a destination to calculate the fee."}
                </p>
                {destination && !quoting && !quote && (
                  <button
                    className="btn-secondary"
                    onClick={() => setDestination({ ...destination })}
                  >
                    Retry quotation
                  </button>
                )}
              </div>
            )}
          </section>
          <section className="surface-card p-5">
            <h2 className="mb-3 text-xl font-semibold">Payment</h2>
            <div className="segmented-control">
              <button
                className={paymentMethod === "cash" ? "is-selected" : ""}
                disabled={delivery || schedule}
                onClick={() => setPayment("cash")}
              >
                Cash at counter
              </button>
              <button
                className={paymentMethod === "maya" ? "is-selected" : ""}
                onClick={() => setPayment("maya")}
              >
                Maya · Card / wallet
              </button>
            </div>
          </section>
          <section className="surface-card space-y-3 p-5">
            <h2 className="text-xl font-semibold">Make it yours</h2>
            <label className="block text-sm">
              Order notes
              <textarea
                className="input-field mt-1 w-full"
                rows={2}
                maxLength={1000}
                value={cart.orderNote}
                onChange={(e) => cart.setOrderNote(e.target.value)}
              />
            </label>
            <details>
              <summary className="min-h-12 cursor-pointer py-3 font-medium">
                Voucher and rewards
              </summary>
              <div className="flex gap-2">
                <input
                  aria-label="Voucher code"
                  className="input-field min-w-0 flex-1"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value)}
                  placeholder="Voucher code"
                />
                <button
                  className="btn-secondary"
                  disabled={!voucherCode || busy}
                  onClick={applyVoucher}
                >
                  Apply
                </button>
              </div>
              {cart.voucher && (
                <p className="mt-2 text-sm">
                  {cart.voucher.code} applied{" "}
                  <button
                    className="ml-2 min-h-12 px-2 underline"
                    onClick={cart.removeVoucher}
                  >
                    Remove
                  </button>
                </p>
              )}
              {user && (
                <label className="mt-3 block text-sm">
                  Use points · up to {maxPoints}
                  <input
                    type="number"
                    min={0}
                    max={maxPoints}
                    step={1}
                    className="input-field mt-1 w-full"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                </label>
              )}
            </details>
          </section>
          <LegalReview onReady={legalCallback} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="surface-card p-5">
            <h2 className="mb-3 text-xl font-semibold">Your order</h2>
            <div className="max-h-[40dvh] space-y-4 overflow-auto">
              {cart.items.map((i) => (
                <div key={i.id} className="flex justify-between gap-3">
                  <div>
                    <strong>
                      {i.quantity} × {i.name}
                    </strong>
                    <p className="text-xs text-text-muted">
                      {i.variants.map((v) => v.label).join(" · ")}
                    </p>
                    {i.notes && <p className="text-xs">{i.notes}</p>}
                  </div>
                  <span>{php(i.price * i.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <p className="flex justify-between">
                <span>Subtotal</span>
                <span>{php(cart.subtotal)}</span>
              </p>
              <p className="flex justify-between">
                <span>Discounts and points</span>
                <span>−{php(cart.discount + redeemed / 10)}</span>
              </p>
              {delivery && (
                <p className="flex justify-between">
                  <span>Delivery</span>
                  <span>{quote ? php(quote.deliveryFee) : "Pending"}</span>
                </p>
              )}
              <p className="flex justify-between text-xl font-semibold">
                <span>Total</span>
                <span>{php(total)}</span>
              </p>
            </div>
          </section>
          <div className="checkout-action">
            {error && <InlineNotice tone="error">{error}</InlineNotice>}
            <div className="portrait-only checkout-action-total">
              <small>Review total</small>
              <strong>{php(total)}</strong>
            </div>
            <button
              className="btn-primary min-h-14 w-full"
              disabled={
                !cart.hydrated ||
                !cart.items.length ||
                !legalReady ||
                quoting ||
                busy
              }
              onClick={review}
            >
              Review order
              <span className="wide-screen-title"> · {php(total)}</span>
            </button>
          </div>
          <Link
            href="/cart"
            className="block min-h-12 py-3 text-center text-sm underline"
          >
            Edit your ticket
          </Link>
        </aside>
      </div>
      {mapOpen && (
        <DeliveryMapPickerLazy
          lat={destination?.lat ?? branch.latitude}
          lng={destination?.lng ?? branch.longitude}
          onClose={() => setMapOpen(false)}
          onLocationChange={(lat, lng, address) => {
            setDestination({ lat, lng, address });
            setMapOpen(false);
          }}
        />
      )}
    </AppShell>
  );
}
