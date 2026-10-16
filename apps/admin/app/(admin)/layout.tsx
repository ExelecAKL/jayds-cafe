// apps/admin/app/(admin)/layout.tsx
// Admin layout with client-side auth gate + sidebar

"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { resolveCustomerPortalUrl } from "@cafeos/shared/customer-url";
import { OperationsProvider } from "../../components/Operations";
import { Topbar } from "../../components/Topbar";
import { Sidebar } from "../../components/Sidebar";
import { BrandArtwork } from "@cafeos/shared/brand";
import { LoadingRows } from "../../components/Operations";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const {
    initialized,
    user,
    profile,
    signOut,
    profileLoading,
    profileError,
    sessionError,
    refreshProfile,
  } = useAuth();
  const resolvedRole = profile?.id === user?.id ? profile?.role : null;
  const hasAccess = resolvedRole === "admin" && profile?.is_approved === true;

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (!user && !sessionError) {
      router.replace("/login");
      return;
    }

    // Staff users are not allowed — redirect to Customer app
    if (resolvedRole === "staff") {
      void handleSignOut();
      window.location.href = resolveCustomerPortalUrl(
        process.env.NEXT_PUBLIC_CUSTOMER_URL,
        window.location.hostname,
      );
      return;
    }

    if (resolvedRole && !hasAccess) {
      void handleSignOut();
      router.replace("/login");
    }
  }, [
    hasAccess,
    initialized,
    resolvedRole,
    router,
    handleSignOut,
    user,
    sessionError,
  ]);

  if (!initialized || !user || !resolvedRole || !hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 p-6">
          <div style={{ width: 220, margin: "0 auto" }}>
            <BrandArtwork variant="lockup" />
          </div>
          {!profileError && !sessionError && (
            <LoadingRows label="Opening Admin…" rows={2} />
          )}
          <p
            role="status"
            className={profileError || sessionError ? "" : "sr-only"}
          >
            {profileError || sessionError
              ? "Let’s reconnect your account"
              : "Opening Admin…"}
          </p>
          {initialized &&
            (profileError ||
              sessionError ||
              (user && !profile && !profileLoading)) && (
              <>
                <p>
                  Your account could not load. Try again, or sign out and sign
                  back in.
                </p>
                <button
                  className="ops-button"
                  disabled={profileLoading}
                  onClick={() => void refreshProfile()}
                >
                  {profileLoading ? "Reconnecting…" : "Retry verification"}
                </button>
                <button className="ops-button" onClick={handleSignOut}>
                  Sign out
                </button>
              </>
            )}
        </div>
      </div>
    );
  }

  return (
    <OperationsProvider>
      <div className="admin-shell">
        <Sidebar
          role="admin"
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="ops-main">
          <Topbar onMenu={() => setSidebarOpen(true)} />
          <main>{children}</main>
        </div>
      </div>
    </OperationsProvider>
  );
}
