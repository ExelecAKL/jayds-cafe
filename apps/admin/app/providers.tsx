// apps/admin/app/providers.tsx
'use client';

import { AuthProvider } from '@cafeos/shared/hooks/useAuth';

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
