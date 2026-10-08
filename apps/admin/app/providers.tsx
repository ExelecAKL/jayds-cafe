// apps/admin/app/providers.tsx
"use client";

import { AuthProvider } from "@cafeos/shared/hooks/useAuth";
import { ActionConfirmProvider } from "@cafeos/shared/ui/action-confirm";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ActionConfirmProvider>{children}</ActionConfirmProvider>
    </AuthProvider>
  );
}
