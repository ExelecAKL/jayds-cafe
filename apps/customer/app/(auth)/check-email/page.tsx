// apps/customer/app/(auth)/check-email/page.tsx
// Email sent confirmation screen with "Open Email" button

"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState, useEffect, useRef } from "react";
import { supabase } from "@cafeos/shared/supabase/client";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const type = searchParams.get("type"); // 'reset' or 'verify'

  const isReset = type === "reset";
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);
  async function resend() {
    if (sending) return;
    if (cooldown) {
      setFeedback("Wait a minute before requesting another email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFeedback("Return to sign in and enter your email address.");
      return;
    }
    setSending(true);
    setFeedback("");
    try {
      const { error } = isReset
        ? await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + "/reset-password",
          })
        : await supabase.auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: window.location.origin + "/login" },
          });
      if (error) throw error;
      setCooldown(true);
      retryTimer.current = setTimeout(() => setCooldown(false), 60000);
      setFeedback(
        "Email requested. Check your inbox and spam folder; use the newest link.",
      );
    } catch {
      setFeedback(
        "Email could not be requested. Try again shortly or contact the café for help.",
      );
    } finally {
      setSending(false);
    }
  }
  const title = isReset ? "Check Your Email" : "Verify Your Email";
  const message = isReset
    ? "We sent a password reset link to"
    : "We sent a verification link to";

  const maskedEmail = email
    ? (() => {
        const [local, domain] = email.split("@");
        if (!domain || local.length <= 2) return email;
        return `${local.substring(0, 2)}${"•".repeat(Math.min(local.length - 2, 6))}@${domain}`;
      })()
    : "your email";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-6">
      <div className="w-full max-w-sm text-center animate-fade-in">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-200">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 7l-10 7L2 7" />
          </svg>
        </div>

        <h1 className="font-display text-3xl text-text-primary mb-2">
          {title}
        </h1>
        <p className="text-sm text-text-muted mb-1">{message}</p>
        <p className="text-base font-bold text-text-primary mb-6">
          {maskedEmail}
        </p>

        <div className="rounded-3xl border border-border bg-bg-card p-6 shadow-elevated space-y-3">
          {/* Open Gmail */}
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 7l-10 7L2 7" />
            </svg>
            Open Gmail
          </a>

          {/* Open default email app */}
          <a
            href={`mailto:${email}`}
            className="btn-secondary w-full py-3 text-sm flex items-center justify-center gap-2"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Open Email App
          </a>

          <div className="pt-2 border-t border-border">
            <button
              type="button"
              className="btn-secondary min-h-12 w-full"
              disabled={sending || !email}
              onClick={resend}
            >
              {sending
                ? "Sending…"
                : isReset
                  ? "Resend reset email"
                  : "Resend verification email"}
            </button>
            {feedback && (
              <p role="status" className="mt-3 text-sm text-text-secondary">
                {feedback}
              </p>
            )}
            <p className="text-xs text-text-faint">
              Didn&apos;t receive the email? Check your spam folder or{" "}
              <Link
                href={isReset ? "/forgot-password" : "/register"}
                className="text-accent font-semibold hover:text-accent-hover"
              >
                change email
              </Link>
            </p>
          </div>
        </div>

        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
        >
          ← Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg-primary">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CheckEmailContent />
    </Suspense>
  );
}
