import { readFile } from "node:fs/promises";
import path from "node:path";
import { RUNTIME_UPLOAD_DIR, LEGACY_UPLOAD_DIR } from "@/lib/upload-paths";

/**
 * Serves uploaded images at /uploads/<filename>.
 *
 * Why this exists: Next.js snapshots the `public` folder when the server
 * starts, so files written there at runtime (photo uploads) return 404 until
 * a restart — which showed up as broken thumbnails and a Next 404 page when
 * tapping a photo right after taking it. This handler reads uploads from disk
 * on every request instead.
 *
 * Files uploaded before this fix still live in `public/uploads` (served
 * statically when present, and also covered by the legacy fallback here);
 * new uploads go to the runtime `uploads/` folder outside `public`.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string[] }> },
) {
  const { file } = await params;

  // Uploads are a flat folder of generated names — exactly one segment, no
  // path tricks, no dotfiles.
  const filename = file.length === 1 ? file[0] : "";
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  const type =
    CONTENT_TYPES[path.extname(filename).toLowerCase()] ??
    "application/octet-stream";

  for (const dir of [RUNTIME_UPLOAD_DIR, LEGACY_UPLOAD_DIR]) {
    try {
      const buf = await readFile(path.join(dir, filename));
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": type,
          // Filenames are random UUIDs and never rewritten — cache hard.
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      // Try the next location.
    }
  }
  return new Response("Not found", { status: 404 });
}
