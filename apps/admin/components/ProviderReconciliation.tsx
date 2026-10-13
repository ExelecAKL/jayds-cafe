"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useState, type FormEvent } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { appPath } from "@cafeos/shared/utils/app-path";

export interface ReconciliationAttempt {
  id: string;
  order_id: string;
  provider: string;
  state: string;
  request_key: string;
}

export default function ProviderReconciliation({
  attempt,
  onReconciled,
}: {
  attempt: ReconciliationAttempt;
  onReconciled: () => void | Promise<void>;
}) {
  const [providerId, setProviderId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const supported =
    attempt.provider === "maya" || attempt.provider === "lalamove";
  const needsReview = ["uncertain", "creating", "failed"].includes(
    attempt.state,
  );
  const reconcile = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !providerId.trim() || !supported) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session)
        throw new Error(
          "Your Admin session expired. Sign in again before reviewing this reference.",
        );
      const response = await fetch(appPath("/api/customer-care/reconcile"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + data.session.access_token,
        },
        body: JSON.stringify({
          orderId: attempt.order_id,
          provider: attempt.provider,
          providerId: providerId.trim(),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const result = await response.json().catch(() => ({
        error:
          "The provider review result could not be read. Keep the reference and retry.",
      }));
      if (!response.ok)
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "This reference could not be associated. Check the merchant dashboard and retry.",
        );
      if (result.reconciled !== true)
        throw new Error(
          "The provider did not confirm this reference. Keep the case open for review.",
        );
      setNotice(
        attempt.provider === "maya"
          ? `Existing Maya checkout associated. Verified payment status: ${typeof result.paymentStatus === "string" ? result.paymentStatus : "available on the order"}.`
          : "Existing Lalamove order associated. Review its current delivery status on the order.",
      );
      await onReconciled();
    } catch (failure) {
      setError(
        failure instanceof Error && failure.name === "TimeoutError"
          ? "Provider review timed out. Keep this reference and retry; review only retrieves and associates the existing provider record."
          : failure instanceof Error
            ? failure.message
            : "Provider review could not be completed. Keep this reference and retry.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="border-b border-border py-4 text-sm">
      <strong>
        {attempt.provider} · {attempt.state}
      </strong>
      <p className="break-all">Order {attempt.order_id}</p>
      <p className="break-all">Merchant reference {attempt.id}</p>
      <p className="break-all">Submission reference {attempt.request_key}</p>
      {supported && needsReview && (
        <form
          className="ops-form"
          onSubmit={reconcile}
          style={{ marginTop: 14 }}
        >
          <p className="ops-description">
            Find the existing{" "}
            {attempt.provider === "maya" ? "checkout" : "delivery order"} in the
            provider’s merchant dashboard using the merchant reference above.
            Paste its provider ID below. Review retrieves that record and checks
            its order, request reference and amount where applicable before
            associating it.
          </p>
          <label htmlFor={"provider-reference-" + attempt.id}>
            {attempt.provider === "maya"
              ? "Existing Maya checkout ID"
              : "Existing Lalamove order ID"}
            <FieldRequirement required={true} />
            <input
              id={"provider-reference-" + attempt.id}
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              required
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <p className="ops-description">
            Use the exact existing provider ID. An unmatched record stays
            unresolved. This action does not create a payment or delivery
            booking.
          </p>
          <div className="ops-form-actions">
            <button
              className="ops-button primary"
              type="submit"
              disabled={busy || !providerId.trim()}
            >
              {busy
                ? "Reviewing provider record…"
                : "Review & associate existing reference"}
            </button>
          </div>
        </form>
      )}
      {!supported && needsReview && (
        <p className="ops-description" style={{ marginTop: 10 }}>
          Review this operation in the merchant dashboard and the order record.
          Reference association is available for Maya checkout and Lalamove
          delivery attempts.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="ops-feedback error"
          style={{ marginTop: 12 }}
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="ops-feedback success"
          style={{ marginTop: 12 }}
        >
          {notice}
        </p>
      )}
    </article>
  );
}
