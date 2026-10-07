import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
// apps/customer/next.config.ts
// Next.js config with PWA support via Serwist

const enablePwa =
  process.env.NODE_ENV === "production" && process.env.ENABLE_PWA !== "false";
const posUpstreamUrl = process.env.POS_UPSTREAM_URL?.replace(/\/$/, "");
const adminUpstreamUrl = process.env.ADMIN_UPSTREAM_URL?.replace(/\/$/, "");

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Registration and update activation are handled by PwaManager so failed or
  // blocked worker registration does not interrupt ordering or draft editing.
  register: false,
  // Reconnection must preserve active configuration/payment forms. The app's
  // providers refresh data and PwaManager handles explicit worker updates.
  reloadOnOnline: false,
  disable: !enablePwa,
});

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_SCOPE: "customer",
  },
  transpilePackages: ["@cafeos/shared"],
  async redirects() {
    // Redirect existing product links before a loading boundary starts streaming.
    // The UUID constraint keeps /menu/browse outside this legacy route.
    return [
      {
        source:
          "/menu/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
        destination: "/menu/browse/:id",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=()",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/orders/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/checkout/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/receipt/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/account/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/workbox-:path(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
  async rewrites() {
    const beforeFiles: { source: string; destination: string }[] = [];

    if (posUpstreamUrl) {
      beforeFiles.push({
        source: "/pos",
        destination: `${posUpstreamUrl}/pos`,
      });
      beforeFiles.push({
        source: "/pos/:path*",
        destination: `${posUpstreamUrl}/pos/:path*`,
      });
    }

    if (adminUpstreamUrl) {
      beforeFiles.push({
        source: "/admin",
        destination: `${adminUpstreamUrl}/admin`,
      });
      beforeFiles.push({
        source: "/admin/:path*",
        destination: `${adminUpstreamUrl}/admin/:path*`,
      });
    }

    return { beforeFiles };
  },
};

export default withSerwist(nextConfig);
