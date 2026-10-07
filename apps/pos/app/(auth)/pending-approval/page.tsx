"use client";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useRouter } from "next/navigation";
export default function PendingApprovalPage() {
  const { profile, signOut } = useAuth(),
    router = useRouter();
  return (
    <main className="pos-auth">
      <div className="pos-auth-card">
        <p className="pos-eyebrow">JAYDS CAFÉ · TEAM ACCESS</p>
        <h1 className="pos-auth-brand">Awaiting approval</h1>
        <p className="pos-muted">
          Ask your manager to approve this account in Admin before using the
          cashier terminal.
        </p>
        <div className="pos-auth-form">
          <button
            className="pos-button pos-primary"
            onClick={() =>
              profile?.is_approved
                ? router.replace("/dashboard")
                : window.location.reload()
            }
          >
            Check approval
          </button>
          <button
            className="pos-button"
            onClick={() => void signOut().then(() => router.replace("/login"))}
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
