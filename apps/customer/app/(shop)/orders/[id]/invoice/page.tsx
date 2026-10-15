"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { customerHeaders } from "../../../../../context/CustomerFeatures";
import {
  InvoiceDocument,
  type InvoiceRecord,
} from "@cafeos/shared/finance/invoice";
export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { user, initialized } = useAuth();
  if (!initialized) return <p role="status">Loading account…</p>;
  return (
    <InvoiceLoader
      key={`${id}:${user?.id ?? "guest"}`}
      id={id}
      owner={user?.id ?? null}
    />
  );
}
function InvoiceLoader({ id, owner }: { id: string; owner: string | null }) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      setLoading(true);
      setInvoices([]);
      setError("");
      try {
        const headers = owner ? await customerHeaders(owner) : {};
        const response = await fetch(
          `/api/orders/${encodeURIComponent(id)}/invoice`,
          { headers, cache: "no-store", signal: abort.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Invoice could not be loaded.");
        if (!abort.signal.aborted) {
          setInvoices(data.invoices);
          setError(data.reason || "");
        }
      } catch (cause) {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Invoice could not be loaded.",
          );
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => {
      abort.abort();
    };
  }, [id, owner]);
  return (
    <main style={{ padding: "24px 16px" }}>
      <div
        className="print:hidden"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <Link href={`/orders/${id}`}>Back to order</Link>
        {invoices.length > 0 && (
          <button type="button" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        )}
      </div>
      {loading ? (
        <p role="status">Loading invoice…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : null}
      {invoices.map((invoice) => (
        <div key={invoice.id} style={{ marginBottom: 24 }}>
          <InvoiceDocument invoice={invoice} />
        </div>
      ))}
    </main>
  );
}
