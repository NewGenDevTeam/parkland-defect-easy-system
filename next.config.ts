import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions default to a 1MB request-body limit; phone photos are
    // commonly 2-5MB. We cap images at 8MB (validated in src/lib/upload.ts),
    // and set the body limit a little higher to leave room for multipart
    // overhead. NOTE: for Next.js 16 this option lives under `experimental`
    // (verified against node_modules/next config schema + docs).
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
