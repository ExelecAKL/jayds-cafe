// apps/customer/app/providers.tsx
// Global providers — AuthProvider + CartProvider

"use client";

import { AuthProvider, useAuth } from "@cafeos/shared/hooks/useAuth";
import { Fragment } from "react";
import { CartProvider } from "../context/CartContext";
import { StartupLoadingProvider } from "../context/StartupLoadingContext";
import { CustomerFeaturesProvider } from "../context/CustomerFeatures";
import { CustomerToastProvider } from "../context/CustomerToast";
import { OutletAvailabilityProvider } from "../context/OutletAvailability";

// Remount page-local private forms and requests when an account changes.
// Persistent draft providers remain outside this boundary and own their cleanup.
function AccountContent({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <Fragment key={user?.id ?? "guest"}>{children}</Fragment>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CustomerToastProvider>
        <CartProvider>
          <CustomerFeaturesProvider>
            <StartupLoadingProvider>
              <OutletAvailabilityProvider>
                <AccountContent>{children}</AccountContent>
              </OutletAvailabilityProvider>
            </StartupLoadingProvider>
          </CustomerFeaturesProvider>
        </CartProvider>
      </CustomerToastProvider>
    </AuthProvider>
  );
}
