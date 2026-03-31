import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "0" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const withNextIntl = createNextIntlPlugin("./i18n.ts");

const nextConfig: NextConfig = {
  turbopack: {},
  // Produce a minimal standalone server output for Docker runner stage
  output: "standalone",
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "@tanstack/react-query", "sonner", "next-intl"],
  },
};

export default withNextIntl(nextConfig);
