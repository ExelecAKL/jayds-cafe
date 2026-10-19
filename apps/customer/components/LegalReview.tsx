"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { customerHeaders } from "../context/CustomerFeatures";
import { LEGAL_VERSION } from "../lib/legal";
export default function LegalReview({
  onReady,
}: {
  onReady: (ready: boolean) => void;
}) {
  const { user, initialized } = useAuth();
  const [accepted, setAccepted] = useState(false),
    [checked, setChecked] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setAccepted(false);
      setChecked(false);
      onReady(false);
      if (!user) return;
      void customerHeaders(user?.id ?? null)
        .then((headers) =>
          fetch("/api/customer/legal", { headers, cache: "no-store" }),
        )
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error("Legal review could not load.");
          if (!cancelled) {
            setAccepted(d.acknowledged);
            onReady(d.acknowledged);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [user, initialized, onReady]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (user) {
        const r = await fetch("/api/customer/legal", {
          method: "POST",
          headers: await customerHeaders(user?.id ?? null),
          body: JSON.stringify({ version: LEGAL_VERSION, acknowledged: true }),
        });
        if (!r.ok)
          throw new Error("Your acknowledgement could not save. Please retry.");
      }
      setAccepted(true);
      onReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review could not save.");
    } finally {
      setBusy(false);
    }
  }
  if (accepted)
    return (
      <p className="text-xs text-text-muted">
        Terms and Privacy Notice reviewed · {LEGAL_VERSION}
      </p>
    );
  return (
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <label className="flex min-h-12 gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-5 w-5"
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="underline">
            Terms
          </Link>{" "}
          and have read the{" "}
          <Link href="/privacy" target="_blank" className="underline">
            Privacy Notice
          </Link>
          . Optional alerts are a separate choice.
          <FieldRequirement required={true} />
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <button
        className="btn-secondary min-h-12 w-full"
        disabled={!checked || busy}
        onClick={save}
      >
        {busy ? "Saving…" : "Confirm review"}
      </button>
    </section>
  );
}
