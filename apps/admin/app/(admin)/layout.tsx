// apps/admin/app/(admin)/layout.tsx
// Admin layout with client-side auth gate + sidebar

"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { resolveCustomerPortalUrl } from "@cafeos/shared/customer-url";
import { StartupScreen } from "@cafeos/shared/ui/startup-screen";
import { OperationsProvider } from "../../components/Operations";
import { Topbar } from "../../components/Topbar";
import { Sidebar } from "../../components/Sidebar";
import { BrandArtwork } from "@cafeos/shared/brand";

const ADMIN_STEPS = [
  "Checking your session…",
  "Verifying admin access…",
  "Opening the back office…",
];
const SPLASH_MINIMUM = 650;
const SPLASH_EXIT = 340;
import { AdminNotificationsProvider } from "../../components/notifications/AdminNotifications";
import { BackToTop } from "../../components/BackToTop";

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

    // Staff users are not allowed  -  redirect to Customer app
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

  // The branded opening screen stays for at least a moment so it reads as a
  // deliberate step, then fades over the workspace that is already loading.
  const ready = initialized && !!user && !!resolvedRole && hasAccess;
  const openedAt = useRef(0);
  const [splash, setSplash] = useState<"show" | "leaving" | "gone">("show");
  useEffect(() => {
    if (!openedAt.current) openedAt.current = Date.now();
  }, []);
  useEffect(() => {
    if (!ready || splash !== "show") return;
    const wait = Math.max(0, SPLASH_MINIMUM - (Date.now() - openedAt.current));
    const timer = setTimeout(() => setSplash("leaving"), wait);
    return () => clearTimeout(timer);
  }, [ready, splash]);
  useEffect(() => {
    if (splash !== "leaving") return;
    const timer = setTimeout(() => setSplash("gone"), SPLASH_EXIT);
    return () => clearTimeout(timer);
  }, [splash]);
  const splashStep = !initialized ? 0 : !resolvedRole ? 1 : 2;

  if (!initialized || !user || !resolvedRole || !hasAccess) {
    const needsRecovery =
      initialized &&
      (profileError || sessionError || (user && !profile && !profileLoading));
    // While access is being verified, show the opening screen without
    // exposing any navigation or data.
    if (!needsRecovery && !profileError && !sessionError)
      return (
        <StartupScreen
          app="Back office"
          steps={ADMIN_STEPS}
          step={splashStep}
          footer="Jayds Café · Admin"
        />
      );
    return (
      <div className="ask-gate">
        <div className="ask-gate-card jm-reveal">
          <div className="ask-gate-logo">
            <BrandArtwork variant="lockup" />
          </div>
          <p role="status" className="ask-gate-title">
            {profileError || sessionError
              ? "Let’s reconnect your account"
              : "Opening Admin…"}
          </p>
          {needsRecovery && (
            <>
              <p className="ask-gate-copy">
                Your account could not load. Try again, or sign out and sign
                back in.
              </p>
              <div className="ask-gate-actions">
                <button
                  className="ops-button primary"
                  disabled={profileLoading}
                  onClick={() => void refreshProfile()}
                >
                  {profileLoading ? "Reconnecting…" : "Retry verification"}
                </button>
                <button className="ops-button" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <OperationsProvider>
      <AdminNotificationsProvider>
        <div className="admin-shell">
          <a className="ui-skip-link" href="#admin-content">Skip to content</a>
          <Sidebar
            role="admin"
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          <div className="ops-main">
            <Topbar onMenu={() => setSidebarOpen(true)} />
            <main id="admin-content" tabIndex={-1}>{children}</main>
          </div>
          <BackToTop />
        </div>
        {splash !== "gone" && (
          <StartupScreen
            app="Back office"
            steps={ADMIN_STEPS}
            step={2}
            leaving={splash === "leaving"}
            footer="Jayds Café · Admin"
          />
        )}
      </AdminNotificationsProvider>
    </OperationsProvider>
  );
}
