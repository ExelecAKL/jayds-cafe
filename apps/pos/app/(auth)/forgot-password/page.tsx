"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
export default function PosForgotPasswordPage() {
  const { resetPassword } = useAuth(),
    router = useRouter();
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await resetPassword(email.trim());
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.push(
      "/check-email?type=reset&email=" + encodeURIComponent(email.trim()),
    );
  };
  return (
    <main className="pos-auth">
      <div className="pos-auth-card">
        <p className="pos-eyebrow">JAYDS CAFÉ · TEAM ACCESS</p>
        <h1 className="pos-auth-brand">Reset password</h1>
        <p className="pos-muted">Receive a reset link at your staff email.</p>
        <form className="pos-auth-form" onSubmit={(e) => void submit(e)}>
          {error && (
            <p className="pos-error" role="alert">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="reset-email">
              Staff email
              <FieldRequirement required={true} />
            </label>
            <input
              className="pos-field"
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="pos-button pos-primary" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <div className="pos-auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
