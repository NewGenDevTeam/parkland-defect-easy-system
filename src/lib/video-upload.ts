import "server-only";

import { randomUUID } from "node:crypto";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import path from "node:path";
import {
  MAX_VIDEO_BYTES,
  VIDEO_EXT_BY_TYPE,
  VIDEO_EXTENSIONS,
  VIDEO_OVERSIZE_ERROR,
  NO_VIDEO_ERROR,
  checkVideoFile,
} from "./video-limits";
import { RUNTIME_UPLOAD_DIR } from "./upload-paths";

/**
 * Stores one uploaded defect video under `uploads/videos/<defectId>/` with a
 * generated filename, and returns its web URL. Same dev/demo storage caveat
 * as saveUploadedImage in upload.ts: files on the local disk do NOT survive a
 * redeploy on ephemeral hosts unless a persistent volume is mounted over the
 * `uploads` directory (Railway Volume / S3 / R2 for real production).
 *
 * Served by /uploads/[...file]/route.ts, which supports HTTP Range requests
 * for the videos/ subtree so players can seek without downloading everything.
 */

// Videos live in their own subtree, away from the flat photo files.
export const VIDEO_UPLOAD_DIR = path.join(
  /*turbopackIgnore: true*/ RUNTIME_UPLOAD_DIR,
  "videos",
);

// defectId is used as a directory name; only accept cuid-shaped ids (the
// caller has already loaded the defect from the DB, this is defense in depth).
const SAFE_ID = /^[a-z0-9]+$/i;

export async function saveUploadedVideo(
  file: unknown,
  defectId: string,
): Promise<{ url?: string; error?: string }> {
  if (!(file instanceof File) || file.size === 0) {
    return { error: NO_VIDEO_ERROR };
  }
  const invalid = checkVideoFile(file);
  if (invalid) return { error: invalid };
  if (file.size > MAX_VIDEO_BYTES) return { error: VIDEO_OVERSIZE_ERROR };
  if (!SAFE_ID.test(defectId)) return { error: "Invalid defect." };

  // Stored extension: prefer the MIME type, fall back to a whitelisted
  // extension from the original name. checkVideoFile already guaranteed one
  // of the two is valid.
  const fromName = path.extname(file.name).toLowerCase();
  const ext =
    VIDEO_EXT_BY_TYPE[file.type] ??
    ((VIDEO_EXTENSIONS as readonly string[]).includes(fromName)
      ? fromName
      : ".mp4");

  const dir = path.join(/*turbopackIgnore: true*/ VIDEO_UPLOAD_DIR, defectId);
  const filename = `${randomUUID()}${ext}`;
  await mkdir(dir, { recursive: true });
  // Stream the request file to disk rather than buffering it whole in
  // memory. (The DOM typings' ReadableStream isn't async-iterable, so bridge
  // through Readable.fromWeb for writeFile.)
  await writeFile(
    path.join(dir, filename),
    Readable.fromWeb(file.stream() as NodeWebReadableStream<Uint8Array>),
  );

  // Web URL with forward slashes — never a filesystem path.
  return { url: `/uploads/videos/${defectId}/${filename}` };
}

/**
 * Best-effort removal of a stored video (orphan cleanup when the DB write
 * after a successful upload fails). Only accepts our own generated URL shape.
 */
export async function deleteUploadedVideo(url: string): Promise<void> {
  const parts = url.split("/").filter(Boolean); // [uploads, videos, defectId, file]
  if (parts.length !== 4 || parts[0] !== "uploads" || parts[1] !== "videos") {
    return;
  }
  const [, , defectId, filename] = parts;
  if (!SAFE_ID.test(defectId)) return;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(filename)) return;
  try {
    await unlink(
      path.join(/*turbopackIgnore: true*/ VIDEO_UPLOAD_DIR, defectId, filename),
    );
  } catch {
    // Already gone — nothing to do.
  }
}
