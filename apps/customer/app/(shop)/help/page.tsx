"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { customerHeaders } from "../../../context/CustomerFeatures";
import AppShell, { InlineNotice } from "../../../components/AppShell";
import { PRIVACY_CONTACT, PRIVACY_PHONE_URI } from "../../../lib/legal";
interface Case {
  id: string;
  subject: string;
  status: string;
  response: string | null;
  created_at: string;
}
export default function HelpPage() {
  const { user, initialized } = useAuth();
  const [kind, setKind] = useState("order"),
    [orderId, setOrderId] = useState(""),
    [subject, setSubject] = useState(""),
    [message, setMessage] = useState(""),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false),
    [cases, setCases] = useState<Case[]>([]);
  useEffect(() => {
    void Promise.resolve().then(() => {
      const p = new URLSearchParams(location.search),
        kind = p.get("kind") ?? p.get("type");
      if (["order", "privacy", "refund", "account"].includes(kind ?? ""))
        setKind(kind!);
      setOrderId(p.get("orderId") ?? p.get("order") ?? "");
    });
  }, []);
  useEffect(() => {
    if (!initialized || (!user && !orderId)) return;
    let active = true;
    void customerHeaders(user?.id ?? null)
      .then((headers) =>
        fetch(
          "/api/customer/support" +
            (!user ? "?orderId=" + encodeURIComponent(orderId) : ""),
          { headers, cache: "no-store" },
        ),
      )
      .then(async (r) => {
        const d = await r.json();
        if (r.ok && active) setCases(d.cases ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, initialized, orderId]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const r = await fetch("/api/customer/support", {
        method: "POST",
        headers: await customerHeaders(user?.id ?? null),
        body: JSON.stringify({
          kind,
          orderId: orderId || null,
          subject,
          message,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Request could not save.");
      setCases((prev) => [
        {
          id: d.id,
          subject,
          status: "open",
          response: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setSubject("");
      setMessage("");
      setFeedback("Your request is saved. Staff replies will appear here.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Request could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell title="How can we help?" backHref="/account">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-card space-y-4 p-5">
          <h2 className="text-xl font-semibold">Useful answers</h2>
          {[
            [
              "Can I order offline?",
              "You can browse the saved menu and edit your bag. Reconnect to confirm stock, prices and payment.",
            ],
            [
              "Where can I pick up?",
              "Pickup is available regardless of your current location. Delivery coverage is based on your chosen destination.",
            ],
            [
              "My payment did not return to the app",
              "Open your order and retry verification or payment recovery. A retry uses the same accepted order. Do not create another sale while its result is uncertain.",
            ],
            [
              "Can I cancel or request a refund?",
              "Use the order screen before preparation, or submit an order-linked refund request. Authorized staff review payments and any ingredients already consumed.",
            ],
          ].map(([q, a]) => (
            <details key={q} className="border-b border-border pb-3">
              <summary className="min-h-12 cursor-pointer py-3 font-medium">
                {q}
              </summary>
              <p className="text-sm leading-relaxed text-text-secondary">{a}</p>
            </details>
          ))}
          <p className="text-sm">
            Privacy requests:{" "}
            <a href={PRIVACY_PHONE_URI} className="underline">
              {PRIVACY_CONTACT}
            </a>
          </p>
        </section>
        <section className="surface-card p-5">
          <h2 className="mb-4 text-xl font-semibold">Send a private request</h2>
          <form onSubmit={send} className="space-y-4">
            <div className="text-sm">
              <label htmlFor="help-topic" className="block">
                Topic
              </label>
              <select
                id="help-topic"
                className="input-field w-full"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="order">Order help</option>
                <option value="refund">Refund review</option>
                <option value="privacy">Privacy request</option>
                <option value="account">Account help</option>
              </select>
            </div>
            <div className="text-sm">
              <label htmlFor="help-order" className="block">
                Order ID · optional for signed-in members
              </label>
              <input
                id="help-order"
                className="input-field w-full"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="From your order details"
              />
            </div>
            <div className="text-sm">
              <label htmlFor="help-subject" className="block">
                Subject
              </label>
              <input
                id="help-subject"
                className="input-field w-full"
                required
                maxLength={150}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="text-sm">
              <label htmlFor="help-message" className="block">
                Message
              </label>
              <textarea
                id="help-message"
                className="input-field w-full"
                rows={5}
                required
                maxLength={4000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <button
              className="btn-primary min-h-12 w-full"
              disabled={busy || (!user && !orderId)}
            >
              {busy ? "Saving…" : "Send request"}
            </button>
          </form>
          {feedback && (
            <div className="mt-4">
              <InlineNotice>{feedback}</InlineNotice>
            </div>
          )}
        </section>
      </div>
      {cases.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-xl font-semibold">Your requests</h2>
          {cases.map((c) => (
            <article className="surface-card p-4" key={c.id}>
              <strong>{c.subject}</strong>
              <p className="text-sm text-text-muted">
                {c.status.replace("_", " ")}
              </p>
              {c.response && (
                <p className="mt-3 whitespace-pre-wrap text-sm">{c.response}</p>
              )}
            </article>
          ))}
        </section>
      )}
    </AppShell>
  );
}
