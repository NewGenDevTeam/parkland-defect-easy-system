import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.68.115"],
  experimental: {
    // Server Actions default to a 1MB request-body limit. Multi-photo uploads
    // allow up to 5 images × 8MB each, capped at 25MB total per submission
    // (validated in src/lib/upload-limits.ts on both client and server). The
    // body limit sits above that cap so our friendly validation message fires
    // before Next.js rejects the raw request, with headroom for multipart
    // overhead. NOTE: for Next.js 16 this option lives under `experimental`
    // (verified against node_modules/next config schema + docs).
    serverActions: {
      bodySizeLimit: "30mb",
    },
    // This app has middleware (auth proxy), and request bodies passing
    // through it are separately capped at 10MB by default — large multi-photo
    // submissions were truncated ("Unexpected end of form") even with the
    // serverActions limit above. Keep both limits in sync.
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;


