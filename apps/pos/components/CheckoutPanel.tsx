"use client";
import { createUuid } from "@cafeos/shared/utils/uuid";
import { resolveCustomerPortalUrl } from "@cafeos/shared/customer-url";
import { useRef, useState } from "react";
import type { CheckoutResult, RegisterDraft } from "@cafeos/shared/pos/types";
import { pesos } from "@cafeos/shared/pos/draft";
import { cashierRequest, CashierRequestError, useOnline } from "../lib/client";
import { PosDialog, PosIcon } from "./PosPrimitives";
import { QRDisplay } from "./QRDisplay";
type Pending = NonNullable<RegisterDraft["pending_checkout"]>;
export function CheckoutPanel({
  total,
  items,
  base,
  pending,
  initialResult,
  onPending,
  onPaid,
  onClose,
  pickup = false,
}: {
  total: number;
  items: {
    name: string;
    quantity: number;
    subtotal: number;
    details?: string;
  }[];
  base: Record<string, unknown>;
  pending?: Pending;
  initialResult?: CheckoutResult;
  onPending: (pending: Pending | undefined) => void;
  onPaid: (result: CheckoutResult) => void;
  onClose: () => void;
  pickup?: boolean;
}) {
  const [amount, setAmount] = useState(
      pending ? String(pending.payload.cash_received) : "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<CheckoutResult | null>(
      initialResult ?? null,
    );
  const busyRef = useRef(false),
    online = useOnline();
  const [acknowledgedAmount, setAcknowledgedAmount] = useState<string | null>(
    null,
  );
  const cashAcknowledged = acknowledgedAmount === amount;
  const updateAmount = (next: string) => {
    setAcknowledgedAmount(null);
    setAmount(next);
  };
  const received = Number(amount),
    due = pending ? Number(pending.payload.expected_total) : total;
  const valid =
    amount !== "" &&
    /^\d+(\.\d{0,2})?$/.test(amount) &&
    Number.isFinite(received) &&
    received >= due;
  const digit = (value: string) => {
    setError("");
    setAcknowledgedAmount(null);
    setAmount((current) => {
      if (value === "back") return current.slice(0, -1);
      if (value === "clear") return "";
      const next = (current === "0" && value !== "." ? "" : current) + value;
      return /^\d{0,10}(\.\d{0,2})?$/.test(next) ? next : current;
    });
  };
  const accept = async () => {
    if (
      busyRef.current ||
      !online ||
      (!pending && (!valid || !cashAcknowledged))
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const request = pending ?? {
      key: createUuid(),
      payload: { ...base, expected_total: total, cash_received: received },
    };
    onPending(request);
    try {
      const paid = await cashierRequest<CheckoutResult>(
        "/api/orders/checkout",
        request.payload,
        request.key,
      );
      if (paid.payment_status !== "paid")
        throw new Error("Payment could not be confirmed. Retry this sale.");
      setResult(paid);
      onPaid(paid);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Confirmation was interrupted. Retry the same sale.",
      );
      if (
        failure instanceof CashierRequestError &&
        failure.status >= 400 &&
        failure.status < 500
      )
        onPending(undefined);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const customerUrl = resolveCustomerPortalUrl(
    process.env.NEXT_PUBLIC_CUSTOMER_URL,
    typeof window === "undefined" ? undefined : window.location.hostname,
  );
  if (result)
    return (
      <PosDialog
        title={pickup ? "Pickup complete" : "Sale complete"}
        wide
        onClose={onClose}
      >
        <div className="payment-complete">
          <div>
            <div className="payment-success-icon">
              <PosIcon name="check" size={30} />
            </div>
            <h3>
              {result.already_paid
                ? "Payment already recorded"
                : pickup
                  ? "Cash received · Pickup confirmed"
                  : "Payment received"}
            </h3>
            <p className="pos-muted">Order number</p>
            <p className="order-number">{result.order_number}</p>
            <p>
              Paid <strong className="pos-number">{pesos(result.total)}</strong>
            </p>
            {result.payment ? (
              <div className="cash-change" style={{ marginTop: 16 }}>
                <span>Change to return</span>
                <strong className="pos-number">
                  {pesos(result.payment.change_due)}
                </strong>
              </div>
            ) : (
              <p className="pos-muted" style={{ marginTop: 12 }}>
                Cash tender details were not recorded for this payment.
              </p>
            )}
          </div>
          {result.receipt && (
            <div className="payment-receipt">
              <QRDisplay
                data={customerUrl + "/receipt/" + result.receipt.receipt_token}
                size={160}
              />
              <p className="pos-muted">
                Receipt valid until{" "}
                {new Date(result.receipt.expires_at).toLocaleDateString(
                  "en-PH",
                  { timeZone: "Asia/Manila" },
                )}
              </p>
            </div>
          )}
        </div>
        <footer className="pos-dialog-footer">
          <button className="pos-button pos-primary" onClick={onClose}>
            {pickup ? "Back to orders" : "Next sale"} <PosIcon name="right" />
          </button>
        </footer>
      </PosDialog>
    );
  return (
    <PosDialog
      title={pickup ? "Cash at pickup" : "Cash checkout"}
      wide
      locked={busy}
      onClose={onClose}
    >
      <div className="checkout-layout">
        <aside className="checkout-summary">
          <h3>Review ticket</h3>
          <p className="pos-muted">
            {items.reduce((n, i) => n + i.quantity, 0)} items · Cash
          </p>
          <div className="checkout-items">
            {items.map((item, index) => (
              <div className="checkout-item" key={index}>
                <div>
                  {item.quantity} × {item.name}
                  {item.details && <small>{item.details}</small>}
                </div>
                <strong className="pos-number">{pesos(item.subtotal)}</strong>
              </div>
            ))}
          </div>
          <div className="ticket-total">
            <span>Total due</span>
            <strong className="pos-number">{pesos(due)}</strong>
          </div>
          <p className="pos-muted" style={{ marginTop: 12 }}>
            {pickup
              ? "QR verified. Receive cash and hand over this ready order. Payment and collection are recorded together."
              : "Stock and prices are checked when you confirm payment."}
          </p>
        </aside>
        <section className="checkout-tender">
          <div className="checkout-due">
            <span className="pos-muted">Amount due</span>
            <strong className="pos-number">{pesos(due)}</strong>
          </div>
          <label className="pos-muted" htmlFor="cash-received">
            Cash received
          </label>
          <input
            id="cash-received"
            className="pos-field cash-entry"
            value={amount}
            inputMode="decimal"
            autoComplete="off"
            disabled={busy || !!pending}
            placeholder="0.00"
            onChange={(e) => {
              if (/^\d{0,10}(\.\d{0,2})?$/.test(e.target.value))
                updateAmount(e.target.value);
            }}
          />
          <div className="cash-shortcuts">
            <button
              className="pos-button"
              disabled={busy || !!pending}
              onClick={() => updateAmount(due.toFixed(2))}
            >
              Exact
            </button>
            {[100, 200, 500, 1000]
              .filter((n) => n >= due)
              .slice(0, 3)
              .map((n) => (
                <button
                  key={n}
                  className="pos-button"
                  disabled={busy || !!pending}
                  onClick={() => updateAmount(String(n))}
                >
                  {pesos(n).replace(".00", "")}
                </button>
              ))}
          </div>
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
              ".",
              "0",
              "back",
            ].map((value) => (
              <button
                key={value}
                aria-label={
                  value === "back"
                    ? "Backspace"
                    : value === "."
                      ? "Decimal"
                      : value
                }
                disabled={busy || !!pending}
                onClick={() => digit(value)}
              >
                {value === "back" ? <PosIcon name="left" /> : value}
              </button>
            ))}
          </div>
          <div className="cash-change">
            <span>{valid ? "Change" : "Remaining"}</span>
            <strong className="pos-number">
              {pesos(
                valid
                  ? received - due
                  : Math.max(
                      0,
                      due - (Number.isFinite(received) ? received : 0),
                    ),
              )}
            </strong>
          </div>
          {pending && !busy && (
            <p className="pos-notice">
              Confirmation pending. Retry this same sale before editing the
              ticket.
            </p>
          )}
          {!pending && (
            <label className="pos-cash-acknowledgement">
              <input
                type="checkbox"
                aria-label="Cash has been received"
                checked={cashAcknowledged}
                disabled={busy || !valid}
                onChange={(event) =>
                  setAcknowledgedAmount(event.target.checked ? amount : null)
                }
              />
              <span>
                <strong>Cash has been received</strong>
                <small>
                  Check the money in hand before recording this as paid.
                  Changing the amount requires checking again.
                </small>
              </span>
            </label>
          )}
          {error && (
            <p className="pos-error" role="alert">
              {error}
            </p>
          )}
          {!online && (
            <p className="pos-notice">
              Connect to confirm the sale. Your ticket is retained.
            </p>
          )}
        </section>
      </div>
      <footer className="pos-dialog-footer">
        <button className="pos-button" disabled={busy} onClick={onClose}>
          Back to ticket
        </button>
        <button
          className="pos-button pos-success"
          disabled={
            !online || busy || (!pending && (!valid || !cashAcknowledged))
          }
          onClick={() => void accept()}
        >
          <PosIcon name="check" />
          {busy
            ? "Confirming…"
            : pending
              ? "Retry confirmation"
              : pickup
                ? "Receive cash & confirm pickup"
                : "Confirm cash payment"}
        </button>
      </footer>
    </PosDialog>
  );
}
