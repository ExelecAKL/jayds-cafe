// apps/customer/app/(auth)/forgot-password/page.tsx
// Password reset request page — cream/brown theme

"use client";

import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    setIsSubmitting(true);
    const { error: resetError } = await resetPassword(email.trim());
    setIsSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    router.push(
      `/check-email?email=${encodeURIComponent(email.trim())}&type=reset`,
    );
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-6">
      <div className="mb-8 text-center animate-fade-in">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-light shadow-cta">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h1 className="font-display text-3xl text-text-primary">
          Reset Password
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm animate-fade-in-up"
      >
        <div className="rounded-3xl border border-border bg-bg-card p-6 shadow-elevated space-y-4">
          {error && (
            <div className="rounded-2xl border border-feedback-error-border bg-feedback-error px-4 py-3 text-sm text-error animate-fade-in">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="reset-email" className="section-label mb-1.5 block">
              Email Address
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
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-2xl border border-border bg-bg-input pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-faint"
                autoComplete="email"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full py-3.5 text-base"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
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
                Sending...
              </span>
            ) : (
              "Send Reset Link"
            )}
          </button>
        </div>

        <p className="mt-5 text-center text-sm text-text-muted">
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
