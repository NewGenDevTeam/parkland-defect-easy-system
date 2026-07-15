import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { RUNTIME_UPLOAD_DIR, LEGACY_UPLOAD_DIR } from "@/lib/upload-paths";

/**
 * Serves uploaded files:
 * - /uploads/<filename>                       — photos (flat folder, as before)
 * - /uploads/videos/<defectId>/<filename>     — defect videos, with HTTP Range
 *   support so <video> players can seek without downloading the whole file.
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

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

// Generated names only — no path tricks, no dotfiles.
const SAFE_FILENAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;
// Directory segment for a defect id (cuid): plain alphanumerics only.
const SAFE_ID = /^[a-z0-9]+$/i;

// Filenames are random UUIDs and never rewritten — cache hard.
const CACHE_FOREVER = "public, max-age=31536000, immutable";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string[] }> },
) {
  const { file } = await params;

  // Video subtree: /uploads/videos/<defectId>/<filename> — exactly 3 segments.
  if (file.length === 3 && file[0] === "videos") {
    return serveVideo(req, file[1], file[2]);
  }

  // Photos are a flat folder of generated names — exactly one segment.
  const filename = file.length === 1 ? file[0] : "";
  if (!SAFE_FILENAME.test(filename)) {
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
          "Cache-Control": CACHE_FOREVER,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      // Try the next location.
    }
  }
  return new Response("Not found", { status: 404 });
}

/**
 * Streams a stored defect video, honouring a single-range `Range` header
 * (`bytes=start-end`, `bytes=start-`, `bytes=-suffix`) with 206/416 semantics.
 * The file is streamed from disk — never fully buffered in memory.
 */
async function serveVideo(req: Request, defectId: string, filename: string) {
  if (!SAFE_ID.test(defectId) || !SAFE_FILENAME.test(filename)) {
    return new Response("Not found", { status: 404 });
  }
  const type = VIDEO_CONTENT_TYPES[path.extname(filename).toLowerCase()];
  if (!type) return new Response("Not found", { status: 404 });

  const filePath = path.join(
    /*turbopackIgnore: true*/ RUNTIME_UPLOAD_DIR,
    "videos",
    defectId,
    filename,
  );
  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const baseHeaders = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": CACHE_FOREVER,
    "X-Content-Type-Options": "nosniff",
  };

  const rangeHeader = req.headers.get("range");
  if (!rangeHeader) {
    // No Range → the complete file, streamed.
    return new Response(
      Readable.toWeb(createReadStream(filePath)) as ReadableStream,
      {
        headers: { ...baseHeaders, "Content-Length": String(size) },
      },
    );
  }

  const range = parseRange(rangeHeader, size);
  if (!range) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
    });
  }

  const { start, end } = range;
  return new Response(
    Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream,
    {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    },
  );
}

/**
 * Parses a single-range `Range: bytes=…` header against a file of `size`
 * bytes. Returns null when the header is malformed or unsatisfiable (caller
 * answers 416). Multi-range requests fall back to the first range.
 */
function parseRange(
  header: string,
  size: number,
): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)(?:,|$)/.exec(header.trim());
  if (!m || size === 0) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  if (rawStart === "") {
    // Suffix form: last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix === 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= size) return null;
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end };
}
