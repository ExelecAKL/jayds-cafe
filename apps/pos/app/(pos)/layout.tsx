"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
export default function PosProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter(),
    { initialized, user, profile, signOut } = useAuth();
  const approved =
    profile &&
    ["staff", "admin"].includes(profile.role) &&
    profile.is_approved === true;
  useEffect(() => {
    if (!initialized) return;
    if (!user) router.replace("/login");
    else if (profile && !["staff", "admin"].includes(profile.role))
      router.replace("/login");
    else if (profile && profile.is_approved !== true)
      router.replace("/pending-approval");
  }, [initialized, user, profile, router]);
  if (!initialized || !user)
    return (
      <div className="pos-auth">
        <p style={{ color: "#ead4bc" }}>Opening Jayds POS…</p>
      </div>
    );
  if (!approved)
    return (
      <div className="pos-auth">
        <div className="pos-auth-card">
          <h1 className="pos-auth-brand">Jayds Café</h1>
          <p className="pos-notice">
            {profile
              ? "Approved staff access is required."
              : "Your staff profile could not be verified. Your saved draft remains on this terminal."}
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              className="pos-button"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
            <button
              className="pos-button"
              onClick={() =>
                void signOut().then(() => router.replace("/login"))
              }
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  return children;
}
