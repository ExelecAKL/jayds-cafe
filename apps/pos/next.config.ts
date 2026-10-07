import type { NextConfig } from "next";
// apps/pos/next.config.ts

const basePath = process.env.APP_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_APP_SCOPE: "pos",
  },
  transpilePackages: ["@cafeos/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
