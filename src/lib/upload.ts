import "server-only";

import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  MAX_UPLOAD_BYTES,
  OVERSIZE_ERROR,
  NOT_IMAGE_ERROR,
} from "./upload-limits";

/**
 * DEV/DEMO ONLY: writes an uploaded image to the local `public/uploads` folder
 * and returns its public URL. This does NOT persist on serverless / ephemeral
 * hosts (Railway redeploys wipe the folder). For production, swap this for a
 * persistent object store such as Cloudflare R2 or Amazon S3 and store the
 * returned URL instead.
 *
 * Validates that the upload is a non-empty image file within the size limit.
 * This is the single source of truth shared by every upload flow (floor plan,
 * defect reference photos, completion photos).
 */
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

  const ext = path.extname(file.name) || ".png";
  const filename = `${randomUUID()}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), bytes);

  return { url: `/uploads/${filename}` };
}
