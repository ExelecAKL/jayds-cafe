// apps/customer/app/(auth)/register/page.tsx
// Premium cream/brown registration page

"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { BrandArtwork } from "@cafeos/shared/brand";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import PasswordInput from "../../../components/PasswordInput";
import PasswordStrength from "../../../components/PasswordStrength";
import { InlineNotice } from "../../../components/AppShell";
import { useCustomerToast } from "../../../context/CustomerToast";
import { getCustomerAuthErrorMessage } from "../../../utils/authMessages";
import { LEGAL_VERSION } from "../../../lib/legal";
import {
  normalizeContactPhone,
  isValidRegistrationPhone,
  registrationPhoneInput,
} from "@cafeos/shared/customer/phone";

export default function RegisterPage() {
  const router = useRouter();
  const notify = useCustomerToast();
  const { signUp, loading: authLoading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || authLoading) return;
    setError("");
    setNotice("");
    if (!fullName.trim()) {
      setError("Full name is required");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    const contactPhone = normalizeContactPhone(phone);
    if (!isValidRegistrationPhone(contactPhone)) {
      setError("Enter an 11-digit Philippine mobile number starting with 09.");
      return;
    }
    if (!legalAccepted) {
      setError("Review the Terms and Privacy Notice to create your account");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Password must contain at least one number");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setIsSubmitting(true);
    const { error: signUpError, needsEmailConfirmation } = await signUp(
      email.trim(),
      password,
      fullName.trim(),
      contactPhone,
      "customer",
      LEGAL_VERSION,
    );
    setIsSubmitting(false);
    if (signUpError) {
      setError(getCustomerAuthErrorMessage(signUpError));
      return;
    }
    if (needsEmailConfirmation) {
      router.push(
        `/check-email?email=${encodeURIComponent(email.trim())}&type=verify`,
      );
      return;
    }
    notify("Your account is ready.");
    router.push("/menu");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-6 py-10">
      {/* Header */}
      <div className="mb-6 text-center animate-fade-in">
        <BrandArtwork
          variant="horizontal"
          preload
          className="mx-auto mb-5 h-auto w-52 max-w-full"
        />
        <h1 className="font-display text-2xl text-text-primary">
          Create Account
        </h1>
        <p className="mt-1 text-sm text-text-muted">Join Jayds Cafe today</p>
      </div>

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm animate-fade-in-up"
      >
        <div className="rounded-3xl border border-border bg-bg-card p-6 shadow-elevated space-y-3.5">
          {error && <InlineNotice tone="error">{error}</InlineNotice>}
          {notice && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 animate-fade-in">
              {notice}
            </div>
          )}

          <div>
            <label htmlFor="reg-name" className="section-label mb-1.5 block">
              Full Name
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
                <circle cx="12" cy="8" r="4" />
                <path d="M20 21a8 8 0 10-16 0" />
              </svg>
              <input
                id="reg-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Juan Dela Cruz"
                className="w-full rounded-2xl border border-border bg-bg-input pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-faint"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-email" className="section-label mb-1.5 block">
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
                id="reg-email"
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
            <label htmlFor="reg-phone" className="section-label mb-1.5 block">
              Phone Number <FieldRequirement required={true} />
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
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
              </svg>
              <input
                id="reg-phone"
                type="tel"
                required
                autoComplete="tel"
                inputMode="numeric"
                maxLength={11}
                value={phone}
                onChange={(e) =>
                  setPhone(registrationPhoneInput(e.target.value))
                }
                onPaste={(e) => {
                  e.preventDefault();
                  setPhone(
                    registrationPhoneInput(e.clipboardData.getData("text")),
                  );
                }}
                onInvalid={(e) => {
                  e.preventDefault();
                  e.currentTarget.focus();
                  setError(
                    "Enter an 11-digit Philippine mobile number starting with 09.",
                  );
                }}
                placeholder="09XXXXXXXXX"
                aria-describedby="reg-phone-help"
                className="w-full rounded-2xl border border-border bg-bg-input pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-faint"
              />
            </div>
            <p
              id="reg-phone-help"
              className="mt-1.5 text-xs text-text-secondary"
            >
              11 digits, starting with 09
            </p>
          </div>

          <div>
            <label
              htmlFor="reg-password"
              className="section-label mb-1.5 block"
            >
              Password
              <FieldRequirement required={true} />
            </label>
            <PasswordInput
              id="reg-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              autoComplete="new-password"
            />
            {/* Live password strength indicator */}
            {password.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <PasswordStrength password={password} />
                <div className="space-y-0.5">
                  <p
                    className={`text-[11px] ${password.length >= 8 ? "text-emerald-600" : "text-text-faint"}`}
                  >
                    {password.length >= 8 ? "✓" : "○"} At least 8 characters
                  </p>
                  <p
                    className={`text-[11px] ${/[A-Z]/.test(password) ? "text-emerald-600" : "text-text-faint"}`}
                  >
                    {/[A-Z]/.test(password) ? "✓" : "○"} One uppercase letter
                  </p>
                  <p
                    className={`text-[11px] ${/[0-9]/.test(password) ? "text-emerald-600" : "text-text-faint"}`}
                  >
                    {/[0-9]/.test(password) ? "✓" : "○"} One number
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="reg-confirm" className="section-label mb-1.5 block">
              Confirm Password
              <FieldRequirement required={true} />
            </label>
            <PasswordInput
              id="reg-confirm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
          </div>

          <label className="flex min-h-12 items-start gap-3 text-sm">
            <input
              type="checkbox"
              required
              checked={legalAccepted}
              onChange={(e) => setLegalAccepted(e.target.checked)}
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
              . Optional notifications are a separate choice.
              <FieldRequirement required={true} />
            </span>
          </label>
          <button
            type="submit"
            disabled={isSubmitting || authLoading || !legalAccepted}
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
                Creating account...
              </span>
            ) : (
              "Create Account"
            )}
          </button>
        </div>

        <p className="mt-5 text-center text-sm text-text-muted">
          Already have an account?{" "}
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
