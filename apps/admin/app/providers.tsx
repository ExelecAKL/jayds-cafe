// apps/admin/app/providers.tsx
"use client";

import { AuthProvider } from "@cafeos/shared/hooks/useAuth";
import { ActionConfirmProvider } from "@cafeos/shared/ui/action-confirm";
import { AdminToastProvider, notifyAdmin } from "../components/AdminToasts";

const confirmed = () =>
  notifyAdmin("Confirmed. Your action is being processed.");

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminToastProvider>
        <ActionConfirmProvider onConfirmed={confirmed}>
          {children}
        </ActionConfirmProvider>
      </AdminToastProvider>
    </AuthProvider>
  );
}
