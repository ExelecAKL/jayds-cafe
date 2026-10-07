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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { initialized, user, profile, signOut } = useAuth();
  const resolvedRole =
    profile?.role ??
    (typeof user?.user_metadata?.role === "string"
      ? user.user_metadata.role
      : null);
  const hasAccess = resolvedRole === "admin";

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (!user) {
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
  }, [hasAccess, initialized, resolvedRole, router, handleSignOut, user]);

  if (!initialized || !user || !resolvedRole || !hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
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
