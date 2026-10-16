"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { customerHeaders } from "../../../context/CustomerFeatures";
import AppShell, { InlineNotice } from "../../../components/AppShell";
import Icon from "../../../components/Icon";
import { PRIVACY_CONTACT, PRIVACY_PHONE_URI } from "../../../lib/legal";
interface Case {
  id: string;
  subject: string;
  status: string;
  response: string | null;
  created_at: string;
}
const orderPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const answers = [
  [
    "Where is my order?",
    "Open My orders to check its progress, pickup details or delivery updates.",
  ],
  [
    "My payment did not return to the app",
    "Open the existing order and choose payment recovery. Check its result before placing another order.",
  ],
  [
    "Can I cancel or request a refund?",
    "Open your order to see available actions. If you still need help, send us a refund request below.",
  ],
  [
    "Can I browse offline?",
    "Yes. You can browse your saved menu and edit your bag. Reconnect before checkout.",
  ],
];
export default function HelpPage() {
  const { user, initialized } = useAuth();
  return (
    <HelpContent
      key={user?.id ?? "guest"}
      owner={user?.id ?? null}
      initialized={initialized}
    />
  );
}
function HelpContent({
  owner,
  initialized,
}: {
  owner: string | null;
  initialized: boolean;
}) {
  const [kind, setKind] = useState("order"),
    [orderId, setOrderId] = useState(""),
    [subject, setSubject] = useState(""),
    [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [history, setHistory] = useState<{
    key: string;
    cases: Case[];
    loading: boolean;
    error: string;
  }>({ key: "", cases: [], loading: false, error: "" });
  const historyKey = owner ?? `guest:${orderId}`;
  const canRead = !!owner || orderPattern.test(orderId);
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(location.search),
        topic = params.get("kind") ?? params.get("type"),
        order = params.get("orderId") ?? params.get("order") ?? "";
      if (["order", "privacy", "refund", "account"].includes(topic ?? ""))
        setKind(topic!);
      setOrderId(order);
      if (topic || order) setFormOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!initialized || !canRead) return;
    let active = true;
    const timer = setTimeout(
      () => {
        setHistory((previous) => ({
          key: historyKey,
          cases: previous.key === historyKey ? previous.cases : [],
          loading: true,
          error: "",
        }));
        void withRequestDeadline(async (signal) => {
          const response = await fetch(
            "/api/customer/support" +
              (!owner ? "?orderId=" + encodeURIComponent(orderId) : ""),
            {
              headers: await customerHeaders(owner),
              cache: "no-store",
              signal,
            },
          );
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Your requests could not load.");
          return (data.cases ?? []) as Case[];
        })
          .then((cases) => {
            if (active)
              setHistory({ key: historyKey, cases, loading: false, error: "" });
          })
          .catch(() => {
            if (active)
              setHistory((previous) => ({
                ...previous,
                loading: false,
                error: "Your requests could not load. Try again.",
              }));
          });
      },
      owner ? 0 : 350,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [initialized, canRead, historyKey, owner, orderId, attempt]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const data = await withRequestDeadline(async (signal) => {
        const response = await fetch("/api/customer/support", {
          method: "POST",
          headers: await customerHeaders(owner),
          body: JSON.stringify({
            kind,
            orderId: orderId || null,
            subject: subject.trim(),
            message: message.trim(),
          }),
          signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Your request could not save.");
        return data;
      }, 30_000);
      setHistory((previous) => ({
        key: historyKey,
        cases: [
          {
            id: data.id,
            subject,
            status: "open",
            response: null,
            created_at: new Date().toISOString(),
          },
          ...(previous.key === historyKey ? previous.cases : []),
        ],
        loading: false,
        error: "",
      }));
      setSubject("");
      setMessage("");
      setFeedback("Your request is saved. Staff replies will appear here.");
    } catch (failure) {
      setFeedback(
        failure instanceof Error
          ? failure.message
          : "Your request could not save.",
      );
    } finally {
      setBusy(false);
    }
  }
  const cases = history.key === historyKey ? history.cases : [];
  return (
    <AppShell
      title="How can we help?"
      backHref="/account"
      className="help-screen"
    >
      <div className="help-intro">
        <span className="help-intro-icon">
          <Icon name="help" size={28} />
        </span>
        <div>
          <h2>A little help, right here.</h2>
          <p>Find an answer or get in touch with our team.</p>
        </div>
      </div>
      <div className="help-shortcuts">
        <Link href="/orders">
          <Icon name="orders" />
          <span>
            My orders<small>Progress, pickup & payment</small>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
        <button
          onClick={() => {
            setKind("refund");
            setFormOpen(true);
            document
              .getElementById("help-request")
              ?.scrollIntoView({ block: "start" });
          }}
        >
          <Icon name="wallet" />
          <span>
            Payment & refunds<small>Ask us to review an order</small>
          </span>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
      <div className="help-content-grid">
        <section className="surface-card help-answers">
          <h2>Quick answers</h2>
          {answers.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <Icon name="plus" size={16} />
              </summary>
              <p>{answer}</p>
              {question === "Where is my order?" && (
                <Link href="/orders">Open my orders →</Link>
              )}
            </details>
          ))}
          <a className="help-privacy" href={PRIVACY_PHONE_URI}>
            <Icon name="shield" size={16} />
            Privacy support · {PRIVACY_CONTACT}
          </a>
        </section>
        <section className="surface-card help-request" id="help-request">
          <div className="help-section-heading">
            <div>
              <h2>Talk to our team</h2>
              <p>Send a private message about your visit or order.</p>
            </div>
            <Icon name="coffee" size={25} />
          </div>
          {!formOpen ? (
            <button
              className="btn-primary min-h-12 w-full"
              onClick={() => setFormOpen(true)}
            >
              Send a private request
            </button>
          ) : (
            <form onSubmit={send} className="space-y-4 help-form">
              <div>
                <label htmlFor="help-topic">
                  Topic
                  <FieldRequirement required />
                </label>
                <select
                  id="help-topic"
                  className="input-field w-full"
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                >
                  <option value="order">Order help</option>
                  <option value="refund">Refund review</option>
                  <option value="privacy">Privacy request</option>
                  <option value="account">Account help</option>
                </select>
              </div>
              <div>
                <label htmlFor="help-order">
                  Order ID
                  <FieldRequirement required={!owner} />
                </label>
                <input
                  id="help-order"
                  className="input-field w-full"
                  required={!owner}
                  pattern={orderPattern.source}
                  value={orderId}
                  onChange={(event) => setOrderId(event.target.value)}
                  placeholder="From your order details"
                />
              </div>
              <div>
                <label htmlFor="help-subject">
                  Subject
                  <FieldRequirement required />
                </label>
                <input
                  id="help-subject"
                  className="input-field w-full"
                  required
                  maxLength={150}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="help-message">
                  Message
                  <FieldRequirement required />
                </label>
                <textarea
                  id="help-message"
                  className="input-field w-full"
                  rows={4}
                  required
                  maxLength={4000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </div>
              <button
                className="btn-primary min-h-12 w-full"
                disabled={
                  busy ||
                  !initialized ||
                  (!owner && !orderPattern.test(orderId))
                }
              >
                {busy ? "Saving…" : "Send request"}
              </button>
            </form>
          )}
          {feedback && (
            <div className="mt-4">
              <InlineNotice>{feedback}</InlineNotice>
            </div>
          )}
        </section>
      </div>
      {canRead && (
        <section className="help-history">
          <h2>Your requests</h2>
          {history.key === historyKey && history.loading && (
            <p role="status">Loading your requests…</p>
          )}
          {history.key === historyKey && history.error && (
            <div role="alert">
              <p>{history.error}</p>
              <button
                className="btn-secondary"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {history.key === historyKey &&
            !history.loading &&
            !history.error &&
            !cases.length && (
              <p>
                No requests yet. Your messages and replies will appear here.
              </p>
            )}
          {cases.map((item) => (
            <article className="surface-card" key={item.id}>
              <div>
                <strong>{item.subject}</strong>
                <span>{item.status.replaceAll("_", " ")}</span>
              </div>
              <small>
                {new Date(item.created_at).toLocaleDateString("en-PH", {
                  timeZone: "Asia/Manila",
                })}
              </small>
              {item.response && <p>{item.response}</p>}
            </article>
          ))}
        </section>
      )}
    </AppShell>
  );
}
