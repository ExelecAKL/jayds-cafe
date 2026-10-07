// apps/admin/app/layout.tsx
// Admin root layout with AuthProvider + Sidebar

import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
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
  title: "Jayds Café — Back Office",
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
    <html lang="en">
      <body
        className={
          founders.className +
          " " +
          founders.variable +
          " min-h-screen antialiased"
        }
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
