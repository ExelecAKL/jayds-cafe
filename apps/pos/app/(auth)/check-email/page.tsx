"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
function CheckEmailContent() {
  const params = useSearchParams(),
    email = params.get("email") ?? "",
    reset = params.get("type") === "reset";
  const [local, domain] = email.split("@"),
    masked =
      domain && local.length > 2 ? local.slice(0, 2) + "•••@" + domain : email;
  return (
    <main className="pos-auth">
      <div className="pos-auth-card">
        <p className="pos-eyebrow">JAYDS CAFÉ · TEAM ACCESS</p>
        <h1 className="pos-auth-brand">Check your inbox</h1>
        <p className="pos-muted">
          {reset ? "Password reset" : "Email verification"} instructions were
          sent to {masked || "your email"}. Check your spam folder too.
        </p>
        <div className="pos-auth-form">
          <Link className="pos-button pos-primary" href="/login">
            Back to sign in
          </Link>
          <Link
            className="pos-button"
            href={reset ? "/forgot-password" : "/register"}
          >
            Use another email
          </Link>
        </div>
      </div>
    </main>
  );
}
export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  );
}
