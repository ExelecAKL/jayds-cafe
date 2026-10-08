"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useOrders } from "@cafeos/shared/hooks/useOrders";
import { supabase } from "@cafeos/shared/supabase/client";
import { pesos } from "@cafeos/shared/pos/draft";
import { PosShell } from "../../../components/PosShell";
import { PosDialog, PosIcon } from "../../../components/PosPrimitives";
import { useOnline } from "../../../lib/client";
export default function VoidOrderPage() {
  const { user } = useAuth(),
    { orders, error, refetch } = useOrders({
      statuses: ["pending", "confirmed", "preparing", "ready"],
    }),
    online = useOnline();
  const [selected, setSelected] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("orderId"),
  );
  const [pin, setPin] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [notice, setNotice] = useState(""),
    processing = useRef(false);
  const order = orders.find((o) => o.id === selected);
  const [acknowledgedOrder, setAcknowledgedOrder] = useState<string | null>(
    null,
  );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      processing.current ||
      !user ||
      !order ||
      pin.length !== 6 ||
      acknowledgedOrder !== order.id
    )
      return;
    processing.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("void_order_with_pin", {
        p_order_id: order.id,
        p_staff_id: user.id,
        p_pin: pin,
      });
      if (error) throw new Error(error.message);
      if (!data?.success)
        throw new Error(data?.error ?? "Manager authorization was rejected.");
      setNotice(
        order.order_number +
          " voided. " +
          (order.payment_status === "paid"
            ? "Use the existing refund workflow to return payment."
            : "Reservations and redeemed rewards were released."),
      );
      setSelected(null);
      await refetch();
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "The void could not be confirmed. Retry after refreshing.",
      );
    } finally {
      setPin("");
      setBusy(false);
      processing.current = false;
    }
  };
  return (
    <PosShell
      title="Manager override"
      actions={
        <Link className="pos-button" href="/dashboard">
          Back to orders
        </Link>
      }
    >
      <div className="void-layout">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>
            Void an active order
          </h2>
          <p className="pos-muted">
            A manager’s six-digit PIN is required. Every void is recorded.
          </p>
        </div>
        {notice && (
          <p className="pos-notice" role="status">
            {notice}
          </p>
        )}
        {error && <p className="pos-error">{error}</p>}
        <div className="void-order-grid">
          {orders.map((o) => (
            <button
              className="order-ticket order-ticket-open"
              key={o.id}
              onClick={() => {
                setSelected(o.id);
                setMessage("");
                setPin("");
                setAcknowledgedOrder(null);
              }}
            >
              <div className="order-ticket-heading">
                <strong>{o.order_number}</strong>
                <span>{pesos(o.total)}</span>
              </div>
              <div className="order-badges">
                <span className="order-badge">
                  {o.is_parked ? "Parked" : o.status}
                </span>
                <span className="order-badge">
                  {o.payment_status === "pending" ? "Unpaid" : o.payment_status}
                </span>
              </div>
              <p className="order-preview">
                {o.items
                  ?.map((i) => i.quantity + " × " + i.name)
                  .slice(0, 2)
                  .join(" · ")}
              </p>
            </button>
          ))}
          {!orders.length && (
            <div className="pos-empty">No active orders to void.</div>
          )}
        </div>
      </div>
      {order && (
        <PosDialog
          title={"Void " + order.order_number}
          locked={busy}
          onClose={() => setSelected(null)}
        >
          <form onSubmit={(e) => void submit(e)}>
            <div className="pos-dialog-body void-pin">
              <p className="pos-notice">
                {order.inventory_consumed
                  ? "Preparation has started. Ingredients will not be automatically restored."
                  : "Reserved stock will be released."}
                {order.payment_status === "paid"
                  ? " Paid orders still require the existing refund workflow."
                  : ""}
              </p>
              <label htmlFor="manager-pin">Manager PIN</label>
              <label className="pos-cash-acknowledgement">
                <input
                  type="checkbox"
                  aria-label="I understand the cancellation consequences"
                  checked={acknowledgedOrder === order.id}
                  disabled={busy}
                  onChange={(event) =>
                    setAcknowledgedOrder(event.target.checked ? order.id : null)
                  }
                />
                <span>
                  I understand the stock and refund consequences above.
                </span>
              </label>
              <input
                id="manager-pin"
                type="password"
                inputMode="numeric"
                className="pos-field"
                autoComplete="off"
                maxLength={6}
                aria-label="Manager PIN"
                value={pin}
                disabled={busy}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
              <div className="cash-keypad">
                {[
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  "clear",
                  "0",
                  "back",
                ].map((d) => (
                  <button
                    type="button"
                    key={d}
                    disabled={busy}
                    aria-label={
                      d === "back"
                        ? "Backspace PIN"
                        : d === "clear"
                          ? "Clear PIN"
                          : "PIN " + d
                    }
                    onClick={() =>
                      setPin((previous) =>
                        d === "clear"
                          ? ""
                          : d === "back"
                            ? previous.slice(0, -1)
                            : (previous + d).slice(0, 6),
                      )
                    }
                  >
                    {d === "back" ? (
                      <PosIcon name="left" />
                    ) : d === "clear" ? (
                      <PosIcon name="close" />
                    ) : (
                      d
                    )}
                  </button>
                ))}
              </div>
              {message && (
                <p className="pos-error" role="alert">
                  {message}
                </p>
              )}
            </div>
            <footer className="pos-dialog-footer">
              <button
                type="button"
                className="pos-button"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Keep order
              </button>
              <button
                className="pos-button pos-danger"
                disabled={
                  !online ||
                  busy ||
                  pin.length !== 6 ||
                  acknowledgedOrder !== order.id
                }
              >
                {busy ? "Voiding…" : "Authorize void"}
              </button>
            </footer>
          </form>
        </PosDialog>
      )}
    </PosShell>
  );
}
