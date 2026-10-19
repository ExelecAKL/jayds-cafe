"use client";
import { useEffect, useState } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
interface MailStatus {
  enabled: boolean;
  provider_ready: boolean;
  sent: number;
  review: number;
  pending: number;
}
export function InvoiceEmailStatus() {
  const [status, setStatus] = useState<MailStatus | null>(null),
    [busy, setBusy] = useState(false),
    [loadVersion, setLoadVersion] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void withRequestDeadline((signal) =>
      supabase.rpc("invoice_email_status").abortSignal(signal),
    )
      .then((result) => {
        if (!active) return;
        if (result.error) setError("Email delivery status could not load.");
        else setStatus(result.data as MailStatus);
      })
      .catch(() => {
        if (active) setError("Email delivery status could not load.");
      });
    return () => {
      active = false;
    };
  }, [loadVersion]);
  async function toggle() {
    if (busy || !status?.provider_ready) return;
    setBusy(true);
    setError("");
    try {
      const result = await withRequestDeadline((signal) =>
        supabase
          .rpc("invoice_email_set_enabled", { p_enabled: !status.enabled })
          .abortSignal(signal),
      );
      if (result.error) throw result.error;
      setStatus({ ...status, enabled: !status.enabled });
    } catch {
      setError("Email delivery could not update. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside
      aria-label="Invoice email delivery"
      style={{
        border: "var(--ui-legacy-length-1) solid var(--ui-border-default)",
        borderRadius: 16,
        padding: 20,
        margin: "var(--ui-legacy-length-16) 0 var(--ui-legacy-length-24)",
        background: "var(--ui-surface-raised)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Email invoices</h3>
          <p style={{ margin: "var(--ui-legacy-length-6) 0 0" }}>
            {!status
              ? error
                ? "Email delivery status is unavailable."
                : "Checking email delivery…"
              : !status.provider_ready
                ? "Sender not connected. Invoices are available in the app."
                : status.enabled
                  ? "New invoices are emailed automatically."
                  : "Automatic invoice emails are paused."}
          </p>
        </div>
        {status && (
          <button
            className="ops-button"
            type="button"
            disabled={busy || !status.provider_ready}
            onClick={() => void toggle()}
          >
            {busy
              ? "Saving…"
              : status.enabled
                ? "Pause emails"
                : "Email new invoices"}
          </button>
        )}
      </div>
      {status?.provider_ready && (
        <p style={{ fontSize: 12, margin: "var(--ui-legacy-length-12) 0 0" }}>
          {status.sent} sent · {status.pending} waiting
          {status.review ? ` · ${status.review} need review` : ""}. Changes
          apply to future invoices.
        </p>
      )}
      {error && (
        <p role="status" style={{ margin: "var(--ui-legacy-length-12) 0 0" }}>
          {error}
          {!status && (
            <button
              className="ops-button"
              type="button"
              onClick={() => {
                setError("");
                setLoadVersion((value) => value + 1);
              }}
            >
              Retry
            </button>
          )}
        </p>
      )}
    </aside>
  );
}
