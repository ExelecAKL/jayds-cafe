// apps/customer/app/(auth)/login/page.tsx
// Premium cream/brown login page

"use client";

import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import PasswordInput from "../../../components/PasswordInput";
import { BrandArtwork } from "@cafeos/shared/brand";
import { getCustomerAuthErrorMessage } from "../../../utils/authMessages";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, initialized, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialized && user) router.replace("/menu");
  }, [initialized, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || authLoading) return;
    setError("");
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }
    setIsSubmitting(true);
    let signInError: Error | null;
    try {
      ({ error: signInError } = await signIn(email.trim(), password));
    } catch {
      setError(
        "Sign in could not connect. Please try again; your entries are saved.",
      );
      return;
    } finally {
      setIsSubmitting(false);
    }
    if (signInError) {
      const msg = signInError.message.toLowerCase();
      if (
        msg.includes("invalid") ||
        msg.includes("credentials") ||
        msg.includes("invalid login")
      ) {
        setError("Wrong email or password. Please check and try again.");
      } else if (msg.includes("email not confirmed")) {
        setError("Your email is not confirmed yet. Please check your inbox.");
      } else {
        setError(getCustomerAuthErrorMessage(signInError));
      }
      return;
    }
    router.push("/menu");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-6">
      {/* Header */}
      <div className="mb-8 text-center animate-fade-in">
        <BrandArtwork
          variant="lockup"
          preload
          className="mx-auto mb-5 h-auto w-64 max-w-full"
        />
        <h1 className="sr-only">Jayds Café</h1>
        <p className="mt-1 text-sm text-text-muted">
          Welcome back, coffee lover
        </p>
      </div>

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm animate-fade-in-up"
      >
        <div className="rounded-3xl border border-border bg-bg-card p-6 shadow-elevated space-y-4">
          {error && (
            <div className="rounded-2xl border border-error/30 bg-red-50 px-4 py-3 text-sm text-error animate-fade-in">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="section-label mb-1.5 block">
              Email
              <FieldRequirement required={true} />
            </label>
            <div className="relative">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-2xl border border-border bg-bg-input pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-faint"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="section-label mb-1.5 block"
            >
              Password
              <FieldRequirement required={true} />
            </label>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
            />
          </div>

          <div className="flex items-center justify-end">
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              Forgot Password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || authLoading}
            className="btn-primary w-full py-3.5 text-base"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </div>

        <p className="mt-5 text-center text-sm text-text-muted">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            Create one
          </Link>
        </p>
      </form>

      {/* Guest Option */}
      <div className="w-full max-w-sm mt-5">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[10px]">
            <span className="bg-bg-primary px-3 text-text-faint uppercase tracking-widest">
              or
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/menu")}
          className="btn-secondary w-full mt-4"
        >
          Browse as Guest
        </button>
      </div>
    </div>
  );
}
