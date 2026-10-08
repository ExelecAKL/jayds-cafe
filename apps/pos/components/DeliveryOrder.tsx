"use client";
import { useEffect, useRef, useState } from "react";
import type { Order } from "@cafeos/shared/types";
import { safeLalamoveUrl } from "@cafeos/shared/lalamove-urls";
import { pesos } from "@cafeos/shared/pos/draft";
import { cashierRequest, useOnline } from "../lib/client";
import { PosDialog, PosIcon } from "./PosPrimitives";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";

const statuses: Record<string, string> = {
  ASSIGNING_DRIVER: "Finding a rider",
  ON_GOING: "Rider assigned · awaiting collection",
  PICKED_UP: "On the way to the customer",
  COMPLETED: "Delivered",
  CANCELED: "Delivery cancelled · review required",
  REJECTED: "Delivery rejected · review required",
  EXPIRED: "Booking expired · review required",
};
type DeliveryStatus = {
  status: string;
  shareLink?: string | null;
  driver?: { name: string; phone: string; plateNumber: string } | null;
};
export function DeliveryOrder({
  order,
  onClose,
  onChanged,
}: {
  order: Order;
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirm = useActionConfirm();
  const online = useOnline();
  const [linked, setLinked] = useState(!!order.lalamove_order_id);
  const [status, setStatus] = useState<DeliveryStatus>({
    status: order.lalamove_status || "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true),
    processing = useRef(false),
    changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  }, [onChanged]);
  const refresh = async () => {
    const result = await cashierRequest<DeliveryStatus>(
      "/api/orders/delivery",
      { order_id: order.id, action: "status" },
    );
    if (active.current) {
      setStatus(result);
      changed.current();
    }
  };
  useEffect(() => {
    active.current = true;
    if (order.lalamove_order_id && navigator.onLine) {
      processing.current = true;
      void Promise.resolve().then(async () => {
        if (!active.current) return;
        setBusy(true);
        try {
          await refresh();
        } catch (failure) {
          if (active.current)
            setError(
              failure instanceof Error
                ? failure.message
                : "Delivery status could not be checked.",
            );
        } finally {
          processing.current = false;
          if (active.current) setBusy(false);
        }
      });
    }
    return () => {
      active.current = false;
    };
    // The dialog is mounted for one order; explicit refresh uses its latest session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);
  const run = async () => {
    if (processing.current || !online) return;
    processing.current = true;
    setBusy(true);
    setError("");
    try {
      if (!linked) {
        if (
          !(await confirm({
            title: `Book a rider for ${order.order_number}?`,
            description:
              "Check that this paid delivery order is ready to hand to the rider. The server checks payment, readiness, and the quote again before booking.",
            details: [
              order.delivery_address || "Check delivery address on the ticket",
              `Delivery fee on ticket: ${pesos(order.delivery_fee ?? 0)}`,
            ],
            confirmLabel: "Book rider",
          }))
        )
          return;
        if (!active.current) return;
        await cashierRequest("/api/orders/delivery", {
          order_id: order.id,
          action: "dispatch",
        });
        if (active.current) {
          setLinked(true);
          changed.current();
        }
      }
      await refresh();
    } catch (failure) {
      if (active.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Delivery could not be confirmed. Refresh before trying again.",
        );
    } finally {
      processing.current = false;
      if (active.current) setBusy(false);
    }
  };
  const tracking = safeLalamoveUrl(
    status.shareLink || order.lalamove_share_link,
  );
  return (
    <PosDialog
      title={"Delivery · " + order.order_number}
      onClose={onClose}
      locked={busy}
    >
      <div className="pos-dialog-body">
        <span className="order-badge">Delivery</span>
        <h3 style={{ marginTop: 16 }}>
          {linked
            ? statuses[status.status] || "Checking courier status"
            : "Ready for a rider"}
        </h3>
        <p className="pos-muted" style={{ marginTop: 8 }}>
          {order.delivery_address}
        </p>
        <div className="ticket-total" style={{ marginTop: 16 }}>
          <span>Delivery fee paid</span>
          <strong>{pesos(order.delivery_fee)}</strong>
        </div>
        <p className="pos-muted" style={{ marginTop: 16 }}>
          {linked
            ? "Courier updates confirm collection and delivery. Refresh after handing the order to the rider."
            : "Book a Lalamove rider for this paid order. The delivery fee is checked again before booking."}
        </p>
        {status.driver && (
          <p className="pos-notice" style={{ marginTop: 12 }}>
            {status.driver.name} · {status.driver.plateNumber}
            <br />
            <a href={"tel:" + status.driver.phone}>{status.driver.phone}</a>
          </p>
        )}
        {tracking && (
          <a
            className="pos-button"
            style={{ marginTop: 16 }}
            href={tracking}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open courier tracking
          </a>
        )}
        {error && (
          <p className="pos-error" role="alert" style={{ marginTop: 16 }}>
            {error}
          </p>
        )}
        {!online && (
          <p className="pos-error" role="alert">
            Connect to book or refresh a delivery.
          </p>
        )}
      </div>
      <footer className="pos-dialog-footer">
        <button className="pos-button" disabled={busy} onClick={onClose}>
          Close
        </button>
        <button
          className="pos-button pos-primary"
          disabled={busy || !online}
          onClick={() => void run()}
        >
          <PosIcon name={linked ? "refresh" : "delivery"} />
          {busy ? "Checking…" : linked ? "Refresh delivery" : "Book rider"}
        </button>
      </footer>
    </PosDialog>
  );
}
