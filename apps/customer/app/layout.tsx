// apps/customer/app/layout.tsx
// Root layout — local fonts, metadata, global providers

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import DevCacheReset from "../components/DevCacheReset";
import ReadyOrderBuzzer from "../components/ReadyOrderBuzzer";
import StartupOverlay from "../components/StartupOverlay";
import PwaManager from "../components/PwaManager";
import "./globals.css";
import "./mobile.css";

const foundersBody = localFont({
  src: [
    {
      path: "../../../fonts/FoundersGrotesk-Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../../fonts/FoundersGrotesk-LightItalic.otf",
      weight: "300",
      style: "italic",
    },
    {
      path: "../../../fonts/FoundersGrotesk-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../fonts/FoundersGrotesk-RegularItalic.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../fonts/FoundersGrotesk-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../../fonts/FoundersGrotesk-MediumItalic.otf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../../../fonts/FoundersGrotesk-Semibold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../fonts/FoundersGrotesk-SemiboldItalic.otf",
      weight: "600",
      style: "italic",
    },
    {
      path: "../../../fonts/FoundersGrotesk-Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../../fonts/FoundersGrotesk-BoldItalic.otf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-body",
  display: "swap",
});

const foundersDisplay = localFont({
  src: [
    {
      path: "../../../fonts/FoundersGrotesk-Semibold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../fonts/FoundersGrotesk-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jayds Café — Order Online",
  description:
    "Premium cafe ordering — browse, customize, and track your coffee order in real time.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/jayds-favicon-32.png",
    apple: "/icons/jayds-apple-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbf5ee",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${foundersBody.variable} ${foundersDisplay.variable} font-body bg-bg-primary text-text-primary antialiased`}
      >
        <Providers>
          <DevCacheReset />
          <StartupOverlay />
          <ReadyOrderBuzzer />
          <PwaManager />
          {children}
        </Providers>
      </body>
    </html>
  );
}
