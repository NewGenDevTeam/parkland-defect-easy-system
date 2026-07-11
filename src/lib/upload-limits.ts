// Shared upload constraints used by BOTH client and server. Keep this module
// free of any "server-only" import so client components can use it too.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB per image
export const MAX_FILES_PER_UPLOAD = 5;
// Whole-submission budget. Must stay comfortably below the Server Actions
// bodySizeLimit in next.config.ts (30mb) so our friendly message fires before
// Next.js rejects the request body with a raw "Body exceeded" error.
export const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB per submission

export const UPLOAD_HELP_TEXT = "Image only, max 8MB";
export const OVERSIZE_ERROR = "Each image must be smaller than 8MB.";
export const NOT_IMAGE_ERROR = "Only image files are allowed.";
export const TOO_MANY_FILES_ERROR = "You can upload up to 5 photos.";
export const NO_FILES_ERROR = "Select at least one photo.";
export const TOTAL_TOO_LARGE_ERROR =
  "The total upload size must be smaller than 25MB.";

/** Whole-submission size check, shared by client and server. */
export function checkTotalUploadSize(
  files: { size: number }[],
): string | null {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  return total > MAX_TOTAL_UPLOAD_BYTES ? TOTAL_TOO_LARGE_ERROR : null;
}

/**
 * Client-side pre-check so oversized files never even reach the Server Action
 * (whose request body limit would otherwise fail with a raw "Body exceeded"
 * error instead of a friendly message). Returns an error string, or null if ok.
 */
export function checkImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return NOT_IMAGE_ERROR;
  if (file.size > MAX_UPLOAD_BYTES) return OVERSIZE_ERROR;
  return null;
}
