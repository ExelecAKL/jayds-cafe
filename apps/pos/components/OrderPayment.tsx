"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useOrder } from "@cafeos/shared/hooks/useOrders";
import type { CheckoutResult } from "@cafeos/shared/pos/types";
import { pesos } from "@cafeos/shared/pos/draft";
import { cashAtPickup } from "@cafeos/shared/pos/fulfillment";
import { cashierRequest, useRegisterDraft } from "../lib/client";
import { CheckoutPanel } from "./CheckoutPanel";
import { PosDialog } from "./PosPrimitives";
import { TicketDialogSkeleton } from "./PosSkeletons";
export function OrderPayment({
  id,
  onClose,
  onChanged,
  pickupQr,
}: {
  id: string;
  onClose: () => void;
  onChanged?: () => void;
  pickupQr?: string;
}) {
  const { user } = useAuth(),
    { order, loading, error, refetch } = useOrder(id);
  const [saved, update] = useRegisterDraft(
    (user?.id ?? "signed-out") + ":payment:" + id,
  );
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null),
    [failure, setFailure] = useState("");
  useEffect(() => {
    if (order?.payment_status !== "paid") return;
    let active = true;
    void cashierRequest<CheckoutResult>("/api/orders/action", {
      order_id: id,
      action: "receipt",
    })
      .then((result) => {
        if (active) {
          setReceipt({ ...result, already_paid: true });
          update((previous) => ({ ...previous, pending_checkout: undefined }));
        }
      })
      .catch((error) => {
        if (active)
          setFailure(
            error instanceof Error
              ? error.message
              : "Receipt could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [id, order?.payment_status, update]);
  if (
    loading ||
    !order ||
    order.is_parked ||
    (order.payment_method !== "cash" && order.payment_status !== "paid") ||
    (order.payment_status === "paid" && !receipt) ||
    order.status === "cancelled" ||
    (order.status === "completed" && order.payment_status !== "paid") ||
    order.payment_status === "refunded" ||
    (cashAtPickup(order) &&
      order.payment_status !== "paid" &&
      (!pickupQr || order.status !== "ready"))
  )
    return (
      <PosDialog title="Order payment" onClose={onClose}>
        <div className="pos-dialog-body">
          {loading ? (
            <TicketDialogSkeleton label="Loading ticket…" />
          ) : !order ? (
            <p className="pos-error" role="alert">
              {error ?? "Order not found"}
            </p>
          ) : order.is_parked ? (
            <>
              <p>
                Review this parked ticket’s current prices and stock in
                Register.
              </p>
              <Link
                className="pos-button pos-primary"
                href={"/new-order?park=" + order.id}
                style={{ marginTop: 16 }}
              >
                Reopen in Register
              </Link>
            </>
          ) : order.payment_status === "paid" && !receipt ? (
            <>
              {failure ? (
                <p>{failure}</p>
              ) : (
                <TicketDialogSkeleton label="Loading accepted receipt…" />
              )}
              {failure && (
                <button className="pos-button" onClick={() => void refetch()}>
                  Refresh order
                </button>
              )}
            </>
          ) : order.payment_status === "refunded" ||
            order.status === "cancelled" ? (
            <p className="pos-notice">
              This order is closed. Payment cannot be accepted.
            </p>
          ) : cashAtPickup(order) ? (
            <p className="pos-notice">
              Mobile cash orders are paid at pickup. Prepare the order, then
              scan its ready pickup QR to receive cash and confirm collection
              together.
            </p>
          ) : order.payment_method === "maya" ? (
            <>
              <h3>
                {order.order_number} · {pesos(order.total)}
              </h3>
              <p className="pos-notice" style={{ marginTop: 16 }}>
                Maya payment requires provider verification. Await the verified
                status before preparing this order.
              </p>
              {order.maya_checkout_url && (
                <a
                  className="pos-button"
                  href={order.maya_checkout_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginTop: 16 }}
                >
                  Open Maya checkout
                </a>
              )}
              <button
                className="pos-button"
                style={{ marginTop: 16 }}
                onClick={() => void refetch()}
              >
                Check payment status
              </button>
            </>
          ) : (
            <p>This order has been completed.</p>
          )}
        </div>
        <footer className="pos-dialog-footer">
          <button className="pos-button" onClick={onClose}>
            Close
          </button>
        </footer>
      </PosDialog>
    );
  return (
    <CheckoutPanel
      key={id + ":" + (receipt ? "receipt" : "cash")}
      total={order.total}
      items={(order.items ?? []).map((i) => ({
        name: i.name,
        quantity: i.quantity,
        subtotal: i.subtotal,
        details: [...(i.variants ?? []).map((v) => v.label), i.notes]
          .filter(Boolean)
          .join(" · "),
      }))}
      base={{ order_id: id, ...(pickupQr ? { pickup_qr: pickupQr } : {}) }}
      pickup={
        cashAtPickup(order) && (order.status === "completed" || !!pickupQr)
      }
      pending={saved.pending_checkout}
      initialResult={receipt ?? undefined}
      onPending={(pending) =>
        update((previous) => ({ ...previous, pending_checkout: pending }))
      }
      onPaid={(result) => {
        update((previous) => ({ ...previous, pending_checkout: undefined }));
        setReceipt(result);
        onChanged?.();
      }}
      onClose={onClose}
    />
  );
}
