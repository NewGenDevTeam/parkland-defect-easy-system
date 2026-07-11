import "server-only";

import { randomUUID } from "node:crypto";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import {
  MAX_FILES_PER_UPLOAD,
  MAX_UPLOAD_BYTES,
  NOT_IMAGE_ERROR,
  OVERSIZE_ERROR,
  TOO_MANY_FILES_ERROR,
  checkTotalUploadSize,
} from "./upload-limits";
import { RUNTIME_UPLOAD_DIR, LEGACY_UPLOAD_DIR } from "./upload-paths";

/**
 * DEV/DEMO ONLY: writes an uploaded image to the local runtime `uploads`
 * folder and returns its public URL. This does NOT persist on serverless /
 * ephemeral hosts (Railway redeploys wipe the folder). For production, swap
 * this for a persistent object store such as Cloudflare R2 or Amazon S3 and
 * store the returned URL instead.
 *
 * Files are written OUTSIDE `public` (see upload-paths.ts) and served by the
 * /uploads/[...file] route handler, because Next.js does not serve files
 * added to `public` after the server starts.
 *
 * Validates that the upload is a non-empty image file within the size limit.
 * This is the single source of truth shared by every upload flow (floor plan,
 * defect reference photos, completion photos).
 */

// Extensions we are willing to store; the browser URL is derived from this, so
// keep it a strict whitelist (never trust the uploaded filename beyond it).
const SAFE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".heic",
  ".heif",
]);

// Preferred extension by MIME type (camera captures often arrive as
// "image.jpg"; picking by type keeps the stored name honest).
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

export async function saveUploadedImage(
  file: unknown,
): Promise<{ url?: string; error?: string }> {
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose an image file." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: NOT_IMAGE_ERROR };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: OVERSIZE_ERROR };
  }

  const fromName = path.extname(file.name).toLowerCase();
  const ext =
    EXT_BY_TYPE[file.type] ??
    (SAFE_EXTENSIONS.has(fromName) ? fromName : ".jpg");
  const filename = `${randomUUID()}${ext}`;
  await mkdir(/*turbopackIgnore: true*/ RUNTIME_UPLOAD_DIR, {
    recursive: true,
  });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(
    path.join(/*turbopackIgnore: true*/ RUNTIME_UPLOAD_DIR, filename),
    bytes,
  );

  // Browser URL: always the web form with forward slashes — never a
  // filesystem path (path.join on Windows would produce backslashes).
  return { url: `/uploads/${filename}` };
}

/**
 * Batch variant with all-or-nothing semantics: EVERY file is validated before
 * ANY file is written, and if one write fails, the files already written for
 * this batch are removed again. Non-File / empty entries are ignored, so an
 * empty selection resolves to `{ urls: [] }` (callers decide whether zero
 * photos is allowed).
 */
export async function saveUploadedImages(
  files: unknown[],
  maxFiles = MAX_FILES_PER_UPLOAD,
): Promise<{ urls?: string[]; error?: string }> {
  const list = files.filter(
    (f): f is File => f instanceof File && f.size > 0,
  );
  if (list.length > maxFiles) return { error: TOO_MANY_FILES_ERROR };
  for (const f of list) {
    if (!f.type.startsWith("image/")) return { error: NOT_IMAGE_ERROR };
    if (f.size > MAX_UPLOAD_BYTES) return { error: OVERSIZE_ERROR };
  }
  // Whole-submission budget (25MB), checked before ANY file is written so an
  // oversized batch never leaves partial files behind.
  const totalError = checkTotalUploadSize(list);
  if (totalError) return { error: totalError };
  const urls: string[] = [];
  for (const f of list) {
    const saved = await saveUploadedImage(f);
    if (saved.error) {
      await deleteUploadedImages(urls);
      return { error: saved.error };
    }
    urls.push(saved.url!);
  }
  return { urls };
}

/** Remove a batch of uploaded files (orphan cleanup after a failed DB write). */
export async function deleteUploadedImages(urls: string[]): Promise<void> {
  await Promise.all(urls.map(deleteUploadedImage));
}

/**
 * Best-effort removal of an uploaded file, used to clean up orphans when the
 * database write after a successful upload fails. Only accepts plain
 * generated filenames — silently ignores anything else and any fs error.
 */
export async function deleteUploadedImage(url: string): Promise<void> {
  const filename = url.split("/").pop() ?? "";
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(filename)) return;
  for (const dir of [RUNTIME_UPLOAD_DIR, LEGACY_UPLOAD_DIR]) {
    try {
      await unlink(path.join(/*turbopackIgnore: true*/ dir, filename));
      return;
    } catch {
      // Not in this location (or already gone) — try the next.
    }
  }
}
