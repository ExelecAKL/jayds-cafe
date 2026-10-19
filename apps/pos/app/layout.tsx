// apps/pos/app/layout.tsx
// POS root layout with AuthProvider

import type { Metadata } from "next";
import "@cafeos/shared/ui/motion.css";
import "@cafeos/shared/ui/skeleton.css";
import "./globals.css";
import "@cafeos/shared/ui/action-confirm.css";
import "@cafeos/shared/ui/connection-status.css";
import "@cafeos/shared/ui/startup-screen.css";
import "./pos-polish.css";
import { Providers } from "./providers";
import { RouteProgress } from "@cafeos/shared/ui/route-progress";
import { ConnectionStatus } from "@cafeos/shared/ui/connection-status";
import localFont from "next/font/local";
const founders = localFont({
  src: [
    { path: "../../../fonts/FoundersGrotesk-Regular.otf", weight: "400" },
    { path: "../../../fonts/FoundersGrotesk-Medium.otf", weight: "500" },
    { path: "../../../fonts/FoundersGrotesk-Semibold.otf", weight: "600" },
    { path: "../../../fonts/FoundersGrotesk-Bold.otf", weight: "700" },
  ],
  variable: "--font-pos",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jayds Café — Cashier POS",
  description:
    "Staff-facing POS terminal for managing orders and processing payments.",
  icons: {
    icon: "/icons/jayds-favicon-32.png",
    apple: "/icons/jayds-apple-180.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={founders.variable + " antialiased"}>
        <RouteProgress />
        <ConnectionStatus
          copy={{
            offline:
              "Offline. Keep building the ticket on this terminal; payments need a connection.",
            slow: "Slow connection. Orders may take a moment to update.",
            restored: "Back online. Orders are syncing.",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
