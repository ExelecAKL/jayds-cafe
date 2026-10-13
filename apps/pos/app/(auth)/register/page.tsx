"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
export default function PosRegisterPage() {
  const { signUp } = useAuth(),
    router = useRouter();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await signUp(
      email.trim(),
      password,
      name.trim(),
      phone.trim(),
      "staff",
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.push(
      result.needsEmailConfirmation
        ? "/check-email?type=verify&email=" + encodeURIComponent(email.trim())
        : "/pending-approval",
    );
  };
  return (
    <main className="pos-auth">
      <div className="pos-auth-card">
        <p className="pos-eyebrow">JAYDS CAFÉ · TEAM ACCESS</p>
        <h1 className="pos-auth-brand">Join the team</h1>
        <p className="pos-muted">A manager will approve cashier access.</p>
        <form className="pos-auth-form" onSubmit={(e) => void submit(e)}>
          {error && (
            <p className="pos-error" role="alert">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="staff-name">
              Full name
              <FieldRequirement required={true} />
            </label>
            <input
              className="pos-field"
              id="staff-name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="staff-email">
              Email
              <FieldRequirement required={true} />
            </label>
            <input
              className="pos-field"
              id="staff-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="staff-phone">
              Phone <FieldRequirement required={false} />
            </label>
            <input
              className="pos-field"
              id="staff-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="staff-password">
              Password · at least 8 characters
              <FieldRequirement required={true} />
            </label>
            <input
              className="pos-field"
              id="staff-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="staff-confirm">
              Confirm password
              <FieldRequirement required={true} />
            </label>
            <input
              className="pos-field"
              id="staff-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button className="pos-button pos-primary" disabled={busy}>
            {busy ? "Creating account…" : "Request staff access"}
          </button>
        </form>
        <div className="pos-auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
