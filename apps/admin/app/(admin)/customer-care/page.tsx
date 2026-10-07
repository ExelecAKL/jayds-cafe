"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@cafeos/shared/supabase/client";
import ProviderReconciliation from "../../../components/ProviderReconciliation";
interface Case {
  id: string;
  kind: string;
  subject: string;
  message: string;
  response: string | null;
  status: string;
  order_id: string | null;
  created_at: string;
}
interface PaymentReviewOrder {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  payment_review_reason: string | null;
}
export default function CustomerCare() {
  const [cases, setCases] = useState<Case[]>([]),
    [selected, setSelected] = useState<Case | null>(null),
    [response, setResponse] = useState(""),
    [status, setStatus] = useState("in_review"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [operationsError, setOperationsError] = useState(""),
    [operationsLoading, setOperationsLoading] = useState(true),
    [requestsLoaded, setRequestsLoaded] = useState(false),
    [paymentReviews, setPaymentReviews] = useState<PaymentReviewOrder[] | null>(
      null,
    ),
    [paymentReviewsError, setPaymentReviewsError] = useState(""),
    [ops, setOps] = useState<{
      attempts: {
        id: string;
        order_id: string;
        provider: string;
        state: string;
        request_key: string;
      }[];
      failed_push: number;
    } | null>(null);
  const load = useCallback(async () => {
    setOperationsLoading(true);
    try {
      const [requests, operations, reviews] = await Promise.all([
        supabase
          .from("customer_support_cases")
          .select("id,kind,subject,message,response,status,order_id,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.rpc("get_customer_operations"),
        supabase
          .from("orders")
          .select(
            "id,order_number,status,payment_status,total,payment_review_reason",
          )
          .eq("payment_review_required", true)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (requests.error)
        setError(
          "Private requests are unavailable. Confirm your approved Admin access and retry.",
        );
      else {
        setCases(requests.data ?? []);
        setRequestsLoaded(true);
        setError("");
      }
      if (operations.error || !Array.isArray(operations.data?.attempts)) {
        setOperationsError(
          "Provider recovery is unavailable. Confirm your approved Admin access and retry.",
        );
      } else {
        setOps(operations.data);
        setOperationsError("");
      }
      // The checked operations RPC establishes current approved-Admin access.
      // The order query also retains the existing database read policies.
      if (
        operations.error ||
        !Array.isArray(operations.data?.attempts) ||
        reviews.error ||
        !Array.isArray(reviews.data)
      ) {
        setPaymentReviewsError(
          "Payment and delivery reviews are unavailable. Confirm your approved Admin access and retry.",
        );
      } else {
        setPaymentReviews(reviews.data);
        setPaymentReviewsError("");
      }
    } catch {
      setError(
        "Private requests could not refresh. Check your connection and retry.",
      );
      setOperationsError(
        "Provider recovery could not refresh. Check your connection and retry.",
      );
      setPaymentReviewsError(
        "Payment and delivery reviews could not refresh. Check your connection and retry.",
      );
    } finally {
      setOperationsLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.rpc("customer_support_update", {
        p_id: selected.id,
        p_status: status,
        p_response: response,
      });
      if (error) throw error;
      setSelected(null);
      void load();
    } catch {
      setError(
        "The response could not save. Confirm your approved Admin role and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-text-muted">Customer operations</p>
        <h1 className="text-3xl font-semibold">Support & reconciliation</h1>
      </div>
      <aside
        className="ops-panel space-y-2 p-4 text-sm"
        aria-label="Operator readiness"
      >
        <p>
          Demo stock and the four SAMPLE frappe recipes do not certify physical
          stock or actual portions.{" "}
          <Link className="underline" href="/scheduling">
            Scheduling
          </Link>{" "}
          requires current stock/recipe verification and configured hours and
          capacities before pickup slots can be enabled.
        </p>
        <p>
          Live email, Maya/Lalamove, push delivery and installed Android/iOS
          validation remain operator/deployment launch checks. This page does
          not certify those checks or automatically gate every ordering channel.
        </p>
      </aside>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="ops-panel p-5">
          <h2 className="mb-4 text-xl font-semibold">Private requests</h2>
          {cases.length === 0 ? (
            <p role={requestsLoaded ? undefined : "status"}>
              {requestsLoaded
                ? "No requests to review."
                : error
                  ? "Private requests are unavailable. Retry operations to load them."
                  : "Loading private requests…"}
            </p>
          ) : (
            cases.map((c) => (
              <button
                key={c.id}
                className="block min-h-12 w-full border-b border-border py-3 text-left"
                onClick={() => {
                  setSelected(c);
                  setResponse(c.response ?? "");
                  setStatus(c.status === "open" ? "in_review" : c.status);
                }}
              >
                <strong>{c.subject}</strong>
                <small className="block">
                  {c.kind} · {c.status} ·{" "}
                  {new Date(c.created_at).toLocaleDateString("en-PH", {
                    timeZone: "Asia/Manila",
                  })}
                </small>
              </button>
            ))
          )}
        </section>
        <section className="ops-panel p-5">
          <h2 className="mb-4 text-xl font-semibold">Provider recovery</h2>
          <p className="mb-3 text-sm">
            Reconcile uncertain provider responses before making another charge
            or rider booking. Existing refunds require the authorized payment
            workflow.
          </p>
          {operationsError && (
            <div
              role="alert"
              className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              <p>{operationsError}</p>
              {ops && (
                <p className="mt-1">
                  Showing the last loaded references and notification count;
                  they may be out of date.
                </p>
              )}
            </div>
          )}
          {operationsLoading && !ops && !operationsError && (
            <p role="status" className="mb-3 text-sm">
              Loading provider recovery…
            </p>
          )}
          {!operationsLoading &&
            !operationsError &&
            ops?.attempts.length === 0 && (
              <p className="mb-3 text-sm">
                No uncertain provider attempts to review.
              </p>
            )}
          {ops?.attempts?.map((a) => (
            <ProviderReconciliation
              key={a.id}
              attempt={a}
              onReconciled={load}
            />
          ))}
          <p className="mt-4 text-sm">
            Failed notification deliveries: {ops?.failed_push ?? "Unavailable"}
          </p>
          <button
            className="ops-button mt-4 min-h-12"
            disabled={operationsLoading}
            onClick={() => void load()}
          >
            {operationsLoading
              ? "Refreshing operations…"
              : operationsError
                ? "Retry operations"
                : "Refresh operations"}
          </button>
        </section>
      </div>
      <section className="ops-panel space-y-3 p-5">
        <h2 className="text-xl font-semibold">Payment & delivery review</h2>
        <p className="text-sm">
          Flagged orders need manual review, including payments received after
          cancellation, additional settled payments and bookings completed after
          order closure. Find the order number in{" "}
          <Link className="underline" href="/orders">
            Orders
          </Link>{" "}
          and use the existing authorized refund or provider-cancellation
          workflow. This list retains flags for review and shows up to 100 of
          the most recent flagged orders.
        </p>
        {paymentReviewsError && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            <p>{paymentReviewsError}</p>
            {paymentReviews && (
              <p className="mt-1">
                Showing the last loaded review list; it may be out of date.
              </p>
            )}
          </div>
        )}
        {operationsLoading && !paymentReviews && !paymentReviewsError && (
          <p role="status" className="text-sm">
            Loading flagged orders…
          </p>
        )}
        {!operationsLoading &&
          !paymentReviewsError &&
          paymentReviews?.length === 0 && (
            <p className="text-sm">No flagged orders to review.</p>
          )}
        {paymentReviews?.map((order) => (
          <article
            key={order.id}
            className="space-y-1 border-b border-border py-3 text-sm"
          >
            <strong>{order.order_number}</strong>
            <p>
              Order status: {order.status} · Payment: {order.payment_status}
            </p>
            <p>Accepted order total: ₱{Number(order.total).toFixed(2)}</p>
            <p>
              {order.payment_review_reason ||
                "Manual payment or delivery review required."}
            </p>
            <p className="break-all text-text-muted">
              Order reference: {order.id}
            </p>
          </article>
        ))}
        <button
          className="ops-button min-h-12"
          disabled={operationsLoading}
          onClick={() => void load()}
        >
          {operationsLoading
            ? "Refreshing reviews…"
            : paymentReviewsError
              ? "Retry payment reviews"
              : "Refresh payment reviews"}
        </button>
      </section>
      {selected && (
        <section className="ops-panel ops-form space-y-4 p-5">
          <h2 className="text-xl font-semibold">{selected.subject}</h2>
          <p className="whitespace-pre-wrap">{selected.message}</p>
          {selected.order_id && (
            <p className="text-sm">Order {selected.order_id}</p>
          )}
          <label className="block">
            Status
            <select
              className="ops-input w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="open">Open</option>
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <label className="block">
            Private reply
            <textarea
              className="ops-input w-full"
              rows={4}
              maxLength={4000}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            />
          </label>
          <div className="flex gap-3">
            <button
              className="ops-button primary min-h-12"
              disabled={busy}
              onClick={save}
            >
              Save review
            </button>
            <button
              className="ops-button min-h-12"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
