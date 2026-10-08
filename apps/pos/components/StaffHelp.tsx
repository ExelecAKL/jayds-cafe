"use client";
import { PosDialog } from "./PosPrimitives";
export function StaffHelp({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  const register = path.includes("new-order"),
    cancellation = path.includes("void"),
    payment = path.includes("/payment/");
  const steps = register
    ? [
        "Add the products and select any required size or options.",
        "Check the ticket, customer details, and discount before choosing Cash checkout.",
        "Receive the money, enter the amount, acknowledge cash received, and confirm. Return the displayed change.",
      ]
    : cancellation
      ? [
          "Find the correct active order and read its payment status.",
          "Review what cancellation does to stock and payment.",
          "A manager must enter the six-digit PIN to authorize cancellation.",
        ]
      : payment
        ? [
            "Check the order number, total, and payment method before taking payment.",
            "For cash, receive the money and enter the amount. For Maya, use the existing checkout or check its provider status.",
            "Continue only after the system confirms payment. A pending payment is still unpaid.",
          ]
        : [
            "Accept new orders, start preparing, then mark them ready.",
            "Pickup: scan the customer's code from their Orders page. For cash at pickup, receive cash before handing over the order.",
            "Delivery: payment must be confirmed through Maya. When ready, book the rider and follow the courier's updates.",
          ];
  return (
    <PosDialog
      title={
        register
          ? "Help: Register"
          : cancellation
            ? "Help: Cancel an order"
            : payment
              ? "Help: Order payment"
              : "Help: Orders"
      }
      onClose={onClose}
    >
      <div className="pos-dialog-body pos-workflow-help">
        <h3>What to do</h3>
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="pos-notice">
          {register
            ? "Confirm payment only after receiving cash. If confirmation is interrupted, retry the same sale so it is not duplicated."
            : cancellation
              ? "Cancelling a paid order does not automatically refund it. Prepared ingredients are not automatically restored. Follow the café's refund process."
              : payment
                ? "If confirmation is interrupted, check or retry the same payment. Do not create a second charge or treat a checkout link as proof of payment."
                : "Ready means preparation is finished. Pickup codes confirm customer collection; delivery collection and completion come from the courier. Checking Maya status does not manually mark an order paid."}
        </p>
        <p className="pos-muted">
          Keyboard shortcuts: F2 opens Register; F3 opens Orders. If you are
          unsure about a payment or refund, ask the manager before proceeding.
        </p>
      </div>
      <footer className="pos-dialog-footer">
        <button className="pos-button pos-primary" onClick={onClose}>
          Got it
        </button>
      </footer>
    </PosDialog>
  );
}
