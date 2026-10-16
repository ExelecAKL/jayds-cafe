"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@cafeos/shared/supabase/client";
import ProviderReconciliation from "../../../components/ProviderReconciliation";
import {
  Drawer,
  PageHeader,
  Badge,
  Empty,
  LoadingRows,
} from "../../../components/Operations";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { OrderDetailsModal } from "../../../components/OrderDetailsModal";
import { notifyAdmin } from "../../../components/AdminToasts";
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
  const [section, setSection] = useState("requests");
  const [caseFilter, setCaseFilter] = useState("open");
  const [orderOpen, setOrderOpen] = useState(false);
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
      const [requests, operations, reviews] = await withRequestDeadline(
        (signal) =>
          Promise.all([
            supabase
              .from("customer_support_cases")
              .select(
                "id,kind,subject,message,response,status,order_id,created_at",
              )
              .order("created_at", { ascending: false })
              .limit(100)
              .abortSignal(signal),
            supabase.rpc("get_customer_operations").abortSignal(signal),
            supabase
              .from("orders")
              .select(
                "id,order_number,status,payment_status,total,payment_review_reason",
              )
              .eq("payment_review_required", true)
              .order("created_at", { ascending: false })
              .limit(100)
              .abortSignal(signal),
          ]),
      );
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
      notifyAdmin("Customer review saved.", "success");
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
  const visibleCases = cases.filter(
    (item) =>
      caseFilter === "all" ||
      (caseFilter === "open"
        ? item.status !== "resolved"
        : item.status === "resolved"),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CUSTOMER CARE"
        title="Customer help"
        description="Reply to customer requests and review payment issues."
      >
        <button
          className="ops-button"
          disabled={operationsLoading}
          onClick={() => void load()}
        >
          {operationsLoading
            ? "Refreshing operations…"
            : operationsError
              ? "Retry operations"
              : "Refresh operations"}
        </button>
      </PageHeader>
      <div className="ops-tabs" aria-label="Customer help sections">
        <button
          aria-pressed={section === "requests"}
          className={section === "requests" ? "active" : ""}
          onClick={() => setSection("requests")}
        >
          Private requests{" "}
          <small>
            {cases.filter((item) => item.status !== "resolved").length}
          </small>
        </button>
        <button
          aria-pressed={section === "payments"}
          className={section === "payments" ? "active" : ""}
          onClick={() => setSection("payments")}
        >
          Payments & delivery{" "}
          {(operationsError || paymentReviewsError) && (
            <small>Check connection</small>
          )}
        </button>
      </div>
      {error && !selected && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-4">
        <section className="ops-panel p-5" hidden={section !== "requests"}>
          <div className="ops-toolbar">
            <h2 className="text-lg font-semibold">Private requests</h2>
            <span className="spacer" />
            <select
              aria-label="Request status"
              value={caseFilter}
              onChange={(event) => setCaseFilter(event.target.value)}
            >
              <option value="open">Needs a reply</option>
              <option value="all">All requests</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          {visibleCases.length === 0 ? (
            !requestsLoaded && !error ? (
              <LoadingRows label="Loading private requests…" rows={3} />
            ) : (
              <Empty
                icon="support"
                title={
                  error && !requestsLoaded
                    ? "Requests couldn't load"
                    : cases.length
                      ? "No matching requests"
                      : "All caught up"
                }
                description={
                  error && !requestsLoaded
                    ? "Retry to load customer requests."
                    : cases.length
                      ? "Try another status filter."
                      : "Customer requests will appear here."
                }
              />
            )
          ) : (
            visibleCases.map((c) => (
              <button
                key={c.id}
                className="block min-h-12 w-full border-b border-border py-3 text-left"
                onClick={() => {
                  setSelected(c);
                  setResponse(c.response ?? "");
                  setStatus(c.status === "open" ? "in_review" : c.status);
                }}
              >
                <span className="flex items-center justify-between gap-4">
                  <strong>{c.subject}</strong>
                  <Badge tone={c.status === "resolved" ? "success" : "warning"}>
                    {c.status.replaceAll("_", " ")}
                  </Badge>
                </span>
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
        <section className="ops-panel p-5" hidden={section !== "payments"}>
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
        </section>
      </div>
      <section
        className="ops-panel space-y-3 p-5"
        hidden={section !== "payments"}
      >
        <h2 className="text-xl font-semibold">Payment & delivery review</h2>
        <p className="ops-muted text-sm">
          Review flagged payments before charging again or booking another
          rider. Latest 100 flagged orders.
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
            <Link className="ops-text-button" href="/orders">
              {order.order_number} →
            </Link>
            <p>
              Order status: {order.status} · Payment: {order.payment_status}
            </p>
            <p>Accepted order total: ₱{Number(order.total).toFixed(2)}</p>
            <p>
              {order.payment_review_reason ||
                "Manual payment or delivery review required."}
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
      {selected && !orderOpen && (
        <Drawer
          title={selected.subject}
          onClose={() => setSelected(null)}
          busy={busy}
        >
          <div className="ops-form">
            {error && (
              <p role="alert" className="ops-feedback error">
                {error}
              </p>
            )}
            <Badge tone="brand">{selected.kind}</Badge>
            <p className="whitespace-pre-wrap">{selected.message}</p>
            {selected.order_id && (
              <button className="ops-button" onClick={() => setOrderOpen(true)}>
                View connected order →
              </button>
            )}
            <label className="block">
              Status
              <FieldRequirement required={true} />
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
              <FieldRequirement required={false} />
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
          </div>
        </Drawer>
      )}
      {selected?.order_id && orderOpen && (
        <OrderDetailsModal
          orderId={selected.order_id}
          onClose={() => setOrderOpen(false)}
        />
      )}
    </div>
  );
}
