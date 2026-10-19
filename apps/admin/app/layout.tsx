// apps/admin/app/layout.tsx
// Admin root layout with AuthProvider + Sidebar

import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@cafeos/shared/ui/action-confirm.css";
import "@cafeos/shared/ui/motion.css";
import "@cafeos/shared/ui/skeleton.css";
import "../design-system/theme.css";
import "../design-system/dashboard.css";
import "../design-system/admin.css";
import "@cafeos/shared/ui/connection-status.css";
import "@cafeos/shared/ui/startup-screen.css";
import "../design-system/polish.css";
import { RouteProgress } from "@cafeos/shared/ui/route-progress";
import { ConnectionStatus } from "@cafeos/shared/ui/connection-status";
const founders = localFont({
  src: [
    { path: "../../../fonts/FoundersGrotesk-Regular.otf", weight: "400" },
    { path: "../../../fonts/FoundersGrotesk-Medium.otf", weight: "500" },
    { path: "../../../fonts/FoundersGrotesk-Semibold.otf", weight: "600" },
    { path: "../../../fonts/FoundersGrotesk-Bold.otf", weight: "700" },
  ],
  variable: "--font-operations",
  display: "swap",
});
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Jayds Café  -  Back Office",
  description: "Admin panel for managing menu, orders, staff, and analytics.",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('jayds-admin-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}` }} />
      </head>
      <body
        className={
          founders.className +
          " " +
          founders.variable +
          " min-h-screen antialiased"
        }
      >
        <RouteProgress />
        <ConnectionStatus
          copy={{
            offline: "You’re offline. Changes won’t save until you reconnect.",
            slow: "Slow connection. Data may take longer to refresh.",
            restored: "Back online. Data is refreshing.",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
