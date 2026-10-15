"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { BrandArtwork } from "@cafeos/shared/brand";
import { PasswordInput } from "@cafeos/shared/ui/password-input";
export default function PosLoginPage() {
  const { user, profile, initialized, signIn, signOut } = useAuth(),
    router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!initialized || !user || !profile) return;
    if (["staff", "admin"].includes(profile.role))
      router.replace(
        profile.is_approved === true ? "/dashboard" : "/pending-approval",
      );
  }, [initialized, user, profile, router]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const { error } = await signIn(email, password);
    if (error)
      setError(
        error.message.toLowerCase().includes("invalid")
          ? "Check your email and password, then try again."
          : error.message,
      );
    setBusy(false);
  };
  return (
    <main className="pos-auth">
      <div className="pos-auth-card">
        <p className="pos-eyebrow">MAIN BRANCH · CASHIER TERMINAL</p>
        <BrandArtwork variant="lockup" className="pos-auth-logo" preload />
        <h1 className="sr-only">Jayds Café cashier login</h1>
        <p className="pos-muted">Good coffee starts here.</p>
        {user && profile && !["staff", "admin"].includes(profile.role) ? (
          <>
            <p className="pos-error" style={{ marginTop: 20 }}>
              This account does not have cashier access.
            </p>
            <button
              className="pos-button"
              style={{ marginTop: 14 }}
              onClick={() => void signOut()}
            >
              Use a staff account
            </button>
          </>
        ) : (
          <form className="pos-auth-form" onSubmit={(e) => void submit(e)}>
            {error && (
              <p className="pos-error" role="alert">
                {error}
              </p>
            )}
            <div>
              <label htmlFor="email">
                Staff email
                <FieldRequirement required={true} />
              </label>
              <input
                className="pos-field"
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password">
                Password
                <FieldRequirement required={true} />
              </label>
              <PasswordInput
                className="pos-field"
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              className="pos-button pos-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Open terminal"}
            </button>
          </form>
        )}
        <div className="pos-auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
          <Link href="/register">Request staff access</Link>
        </div>
      </div>
    </main>
  );
}
