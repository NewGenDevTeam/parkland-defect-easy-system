import "server-only";

import path from "node:path";

/**
 * Where uploaded images live on disk. Two locations:
 * - RUNTIME_UPLOAD_DIR: all new uploads. Deliberately OUTSIDE `public` because
 *   Next.js snapshots `public` at server start and 404s files added later.
 * - LEGACY_UPLOAD_DIR: uploads made before this fix. Left in place so existing
 *   Drawing/Photo URLs keep working (served statically or via the /uploads
 *   route handler fallback).
 *
 * Browser URLs are always the web form `/uploads/<filename>` — never a
 * filesystem path. See src/app/uploads/[...file]/route.ts.
 */
// The turbopackIgnore annotations keep Turbopack's file tracing (NFT) from
// treating these runtime-only directories as build-time dependencies — without
// them the tracer sweeps the whole project root into the trace and warns
// "Encountered unexpected file in NFT list". Uploaded files are runtime data
// and must never be bundled.
export const RUNTIME_UPLOAD_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "uploads",
);
export const LEGACY_UPLOAD_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "public",
  "uploads",
);
