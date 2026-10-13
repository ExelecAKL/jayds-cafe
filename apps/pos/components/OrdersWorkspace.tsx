"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  formatPickupWindow,
  preparationIsDue,
} from "@cafeos/shared/customer/scheduling";
import {
  useStaffOrders,
  type StaffOrder as Order,
  type StaffQueue,
} from "../lib/useStaffOrders";
import { pesos } from "@cafeos/shared/pos/draft";
import { cashAtPickup } from "@cafeos/shared/pos/fulfillment";
import { cashierRequest, useOnline } from "../lib/client";
import { PosShell } from "./PosShell";
import { PosDialog, PosIcon } from "./PosPrimitives";
import { OrderPayment } from "./OrderPayment";
import { QRScanner } from "./QRScanner";
import { DeliveryOrder } from "./DeliveryOrder";
const fulfillment = (o: Order) =>
  o.order_type === "delivery"
    ? "Delivery"
    : o.order_type === "dine_in"
      ? "Dine-in"
      : o.order_source === "app" || o.order_type === "pickup"
        ? "Pickup"
        : "Takeout";
const stages = [
  {
    status: "pending",
    name: "New orders",
    action: "confirm",
    label: "Accept order",
  },
  {
    status: "confirmed",
    name: "Accepted",
    action: "prepare",
    label: "Start preparing",
  },
  {
    status: "preparing",
    name: "Preparing",
    action: "ready",
    label: "Mark ready",
  },
  { status: "ready", name: "Ready", action: "collect", label: "Collected" },
] as const;
export function OrdersWorkspace() {
  const [queue, setQueue] = useState<StaffQueue>("active"),
    [page, setPage] = useState(0);
  const { orders, loading, error, total, refetch } = useStaffOrders(
      queue,
      page,
    ),
    online = useOnline();
  const parked = queue === "parked",
    future = queue === "future";
  const [search, setSearch] = useState(""),
    [detail, setDetail] = useState<string | null>(null),
    [payment, setPayment] = useState<string | null>(null),
    [paymentQr, setPaymentQr] = useState<string | undefined>(),
    [delivery, setDelivery] = useState<string | null>(null),
    [scanner, setScanner] = useState(false),
    [qr, setQr] = useState(""),
    [scanPanel, setScanPanel] = useState(false);
  const [failures, setFailures] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [now, setNow] = useState(() => Date.now()),
    processing = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const filtered = orders.filter(
    (o) =>
      !!o.is_parked === parked &&
      o.order_number.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = orders.find((o) => o.id === detail);
  const selectedDelivery = orders.find((o) => o.id === delivery);
  const openScanner = () => {
    setNotice("");
    setQr("");
    setScanPanel(false);
    setDetail(null);
    setScanner(true);
  };
  const elapsed = (o: Order) => {
    const minutes = Math.max(
      0,
      Math.floor((now - Date.parse(o.created_at)) / 60000),
    );
    return minutes < 60
      ? minutes + " min"
      : Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
  };
  const action = async (o: Order) => {
    if (processing.current || !online) return;
    if (o.is_parked) return;
    if (o.payment_status === "paid" && !preparationIsDue(o)) return;
    if (o.payment_status !== "paid" && !cashAtPickup(o)) {
      setPaymentQr(undefined);
      setPayment(o.id);
      return;
    }
    if (o.status === "ready" && o.order_type === "delivery") {
      setDetail(null);
      setDelivery(o.id);
      return;
    }
    if (
      o.status === "ready" &&
      o.order_source !== "pos" &&
      o.order_type === "pickup"
    ) {
      openScanner();
      return;
    }
    const stage = stages.find((s) => s.status === o.status);
    if (!stage) return;
    processing.current = true;
    setBusy(o.id);
    setFailures((previous) => ({ ...previous, [o.id]: "" }));
    try {
      await cashierRequest("/api/orders/action", {
        order_id: o.id,
        action: stage.action,
        expected_status: o.status,
      });
      await refetch();
      setNotice(o.order_number + " · " + stage.label);
    } catch (failure) {
      setFailures((previous) => ({
        ...previous,
        [o.id]:
          failure instanceof Error
            ? failure.message
            : "Action could not be confirmed. Refresh and retry.",
      }));
      await refetch();
    } finally {
      processing.current = false;
      setBusy("");
    }
  };
  const pickup = async (value: string) => {
    setScanner(false);
    if (processing.current) return;
    processing.current = true;
    setBusy("pickup");
    try {
      const result = await cashierRequest<{
        id: string;
        payment_required?: boolean;
        already_collected?: boolean;
      }>("/api/orders/pickup", { qr: value });
      setScanPanel(false);
      setQr("");
      if (result.payment_required) {
        setPaymentQr(value);
        setPayment(result.id);
      } else
        setNotice(
          result.already_collected
            ? "This order was already collected."
            : "Pickup confirmed.",
        );
      await refetch();
    } catch (failure) {
      setScanPanel(true);
      setNotice(
        failure instanceof Error
          ? failure.message
          : "Pickup could not be confirmed.",
      );
    } finally {
      processing.current = false;
      setBusy("");
    }
  };
  const buttons = (o: Order) =>
    o.is_parked ? (
      <Link className="pos-button pos-primary" href={"/new-order?park=" + o.id}>
        Reopen ticket
      </Link>
    ) : (
      <button
        className={
          "pos-button " +
          (o.payment_status === "paid" || cashAtPickup(o) ? "pos-primary" : "")
        }
        disabled={
          !online ||
          !!busy ||
          (o.payment_status === "paid" && !preparationIsDue(o, now)) ||
          (o.stock_conflict && o.status === "confirmed") ||
          o.payment_status === "refunded" ||
          o.payment_status === "failed"
        }
        onClick={() => void action(o)}
      >
        {busy === o.id
          ? "Updating…"
          : o.payment_status === "paid" && !preparationIsDue(o, now)
            ? "Preparation scheduled"
            : o.payment_status !== "paid" && !cashAtPickup(o)
              ? o.payment_method === "maya"
                ? "Verify Maya"
                : "Take payment"
              : o.status === "ready" && o.order_type === "delivery"
                ? o.lalamove_order_id
                  ? "Delivery status"
                  : "Book rider"
                : o.status === "ready" &&
                    o.order_source !== "pos" &&
                    o.order_type === "pickup"
                  ? "Scan pickup"
                  : stages.find((s) => s.status === o.status)?.label}
      </button>
    );
  const card = (o: Order) => (
    <article className="order-ticket" key={o.id}>
      <button
        className="order-ticket-open"
        aria-label={"Open order " + o.order_number}
        onClick={() => setDetail(o.id)}
      >
        <div className="order-ticket-heading">
          <strong>{o.order_number}</strong>
          <small>{elapsed(o)}</small>
        </div>
        <div className="order-badges">
          <span
            className={
              "order-badge order-fulfillment " +
              (o.order_type === "delivery" ? "is-delivery" : "is-pickup")
            }
          >
            <PosIcon
              name={
                o.order_type === "delivery"
                  ? "delivery"
                  : o.order_type === "dine_in"
                    ? "coffee"
                    : "orders"
              }
              size={15}
            />
            {fulfillment(o)}
          </span>
          <span className="order-badge">
            {o.order_source === "pos" ? "Counter" : "Mobile app"}
          </span>
          <span
            className={
              "order-badge " +
              (o.payment_status === "paid" ? "is-paid" : "is-unpaid")
            }
          >
            {o.payment_method === "maya" ? "Maya" : "Cash"} ·{" "}
            {o.payment_status === "pending"
              ? cashAtPickup(o)
                ? "Pay at pickup"
                : "Unpaid"
              : o.payment_status}
          </span>
          {o.stock_conflict && (
            <span className="order-badge is-unpaid">Stock review needed</span>
          )}
        </div>
        <p className="order-preview">
          {(o.items ?? [])
            .slice(0, 2)
            .map((i) => i.quantity + " × " + i.name)
            .join(" · ")}
          {(o.items?.length ?? 0) > 2 ? " + more" : ""}
        </p>
        {o.pickup_window_start && o.pickup_window_end && (
          <p className="order-preview">
            Pickup:{" "}
            {formatPickupWindow(o.pickup_window_start, o.pickup_window_end)}
            <br />
            Preparation due:{" "}
            {new Date(o.preparation_due_at!).toLocaleTimeString("en-PH", {
              timeZone: "Asia/Manila",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
      </button>
      <div className="order-ticket-total">
        <span>
          {(o.items ?? []).reduce((n, i) => n + i.quantity, 0)} items
          {o.is_parked ? " · No stock reserved" : ""}
        </span>
        <strong className="pos-number">{pesos(o.total)}</strong>
      </div>
      <div className="order-ticket-actions">{buttons(o)}</div>
      {failures[o.id] && (
        <p className="pos-error" role="alert">
          {failures[o.id]}
        </p>
      )}
    </article>
  );
  return (
    <PosShell
      title="Orders"
      actions={
        <Link className="pos-button pos-primary" href="/new-order">
          <PosIcon name="plus" />
          New sale
        </Link>
      }
    >
      <div className="orders-workspace">
        <div className="orders-toolbar">
          <div className="orders-tabs">
            <button
              className={queue === "active" ? "is-selected" : ""}
              onClick={() => {
                setQueue("active");
                setPage(0);
              }}
            >
              Active{queue === "active" ? ` · ${total}` : ""}
            </button>
            <button
              className={future ? "is-selected" : ""}
              onClick={() => {
                setQueue("future");
                setPage(0);
              }}
            >
              Scheduled{future ? ` · ${total}` : ""}
            </button>
            <button
              className={parked ? "is-selected" : ""}
              onClick={() => {
                setQueue("parked");
                setPage(0);
              }}
            >
              Parked{parked ? ` · ${total}` : ""}
            </button>
          </div>
          <input
            className="pos-field"
            style={{ maxWidth: 230 }}
            placeholder="Find order number…"
            aria-label="Find order number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="pos-icon-button"
              aria-label="Refresh orders"
              onClick={() => void refetch()}
            >
              <PosIcon name="refresh" />
            </button>
            <button
              className="pos-button"
              disabled={!online || !!busy}
              onClick={openScanner}
            >
              <PosIcon name="scan" />
              Scan pickup
            </button>
          </div>
        </div>
        {error && (
          <p className="pos-error" role="alert">
            {error}
          </p>
        )}
        {future && (
          <p className="pos-notice">
            Paid future pickups appear here until preparation is due. Starting
            preparation deducts their reserved stock.
          </p>
        )}
        {parked || future ? (
          <div className="parked-grid">
            {filtered.map(card)}
            {!filtered.length && (
              <div className="pos-empty">
                <strong>
                  {future ? "No future paid pickups" : "No parked tickets"}
                </strong>
                <span>
                  {future
                    ? "Upcoming scheduled pickups will appear here after payment is confirmed."
                    : "Park an unfinished sale in Register to reopen it here."}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="orders-grid">
            {stages.map((stage) => (
              <section
                className="orders-column"
                key={stage.status}
                aria-label={stage.name}
              >
                <header className="orders-column-heading">
                  {stage.name}
                  <span>
                    {filtered.filter((o) => o.status === stage.status).length}
                  </span>
                </header>
                <div className="column-tickets">
                  {filtered.filter((o) => o.status === stage.status).map(card)}
                  {!filtered.some((o) => o.status === stage.status) && (
                    <div className="pos-empty">
                      {loading ? "Loading…" : "No orders"}
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
        {total > 50 && (
          <div
            className="orders-toolbar"
            style={{ justifyContent: "flex-end", marginTop: 20 }}
          >
            <span>
              Page {page + 1} of {Math.ceil(total / 50)}
            </span>
            <button
              className="pos-button"
              disabled={page === 0 || !!busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              className="pos-button"
              disabled={(page + 1) * 50 >= total || !!busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
      {selected && (
        <PosDialog
          title={selected.order_number}
          onClose={() => setDetail(null)}
        >
          <div className="pos-dialog-body">
            <div className="order-badges">
              <span className="order-badge order-fulfillment">
                {fulfillment(selected)}
              </span>
              <span className="order-badge">{selected.status}</span>
              <span className="order-badge">
                {selected.payment_method} ·{" "}
                {cashAtPickup(selected) && selected.payment_status === "pending"
                  ? "Pay at pickup"
                  : selected.payment_status}
              </span>
              <span className="order-badge">{elapsed(selected)}</span>
            </div>
            {selected.customer?.full_name && (
              <p className="pos-muted">{selected.customer.full_name}</p>
            )}
            <div className="order-details-items">
              {selected.items?.map((item) => (
                <div className="checkout-item" key={item.id}>
                  <div>
                    {item.quantity} × {item.name}
                    <small>
                      {item.variants?.map((v) => v.label).join(" · ")}
                    </small>
                    {item.notes && <small>Note: {item.notes}</small>}
                  </div>
                  <strong>{pesos(item.subtotal)}</strong>
                </div>
              ))}
            </div>
            {selected.notes && (
              <p className="pos-notice" style={{ marginTop: 12 }}>
                {selected.notes}
              </p>
            )}
            <div className="ticket-total" style={{ marginTop: 16 }}>
              <span>Total</span>
              <strong>{pesos(selected.total)}</strong>
            </div>
            {failures[selected.id] && (
              <p className="pos-error">{failures[selected.id]}</p>
            )}
          </div>
          <footer className="pos-dialog-footer">
            <Link className="pos-button" href={"/void?orderId=" + selected.id}>
              Override
            </Link>
            {selected.payment_status === "paid" && (
              <button
                className="pos-button"
                onClick={() => {
                  setDetail(null);
                  setPaymentQr(undefined);
                  setPayment(selected.id);
                }}
              >
                Receipt
              </button>
            )}
            {buttons(selected)}
          </footer>
        </PosDialog>
      )}
      {payment && (
        <OrderPayment
          id={payment}
          pickupQr={paymentQr}
          onClose={() => {
            setPayment(null);
            setPaymentQr(undefined);
            void refetch();
          }}
          onChanged={() => void refetch()}
        />
      )}{" "}
      {scanPanel && (
        <PosDialog title="Confirm pickup" onClose={() => setScanPanel(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pickup(qr);
            }}
          >
            <div className="pos-dialog-body">
              <p className="pos-muted">
                Scan the customer QR or enter its pickup code. Payment and
                readiness are checked before collection.
              </p>
              <label>
                Pickup QR code
                <FieldRequirement required={true} />
                <input
                  className="pos-field"
                  aria-label="Pickup QR code"
                  value={qr}
                  onChange={(e) => setQr(e.target.value)}
                  placeholder="pickup:order-id:token"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ marginTop: 16 }}
                />
              </label>
              {notice && (
                <p className="pos-error" role="alert">
                  {notice}
                </p>
              )}
            </div>
            <footer className="pos-dialog-footer">
              <button
                className="pos-button"
                type="button"
                onClick={() => {
                  openScanner();
                }}
              >
                <PosIcon name="scan" />
                Camera
              </button>
              <button
                className="pos-button pos-primary"
                disabled={!qr || !!busy}
                type="submit"
              >
                {busy ? "Checking…" : "Confirm pickup"}
              </button>
            </footer>
          </form>
        </PosDialog>
      )}
      {scanner && (
        <QRScanner
          title="Scan pickup QR"
          onScan={(value) => void pickup(value)}
          onClose={() => setScanner(false)}
          onManualEntry={() => {
            setScanner(false);
            setScanPanel(true);
          }}
        />
      )}{" "}
      {selectedDelivery && (
        <DeliveryOrder
          key={selectedDelivery.id}
          order={selectedDelivery}
          onClose={() => setDelivery(null)}
          onChanged={() => void refetch()}
        />
      )}
      {notice && !scanPanel && !scanner && (
        <div className="pos-toast" role="status">
          {notice}
        </div>
      )}
    </PosShell>
  );
}
