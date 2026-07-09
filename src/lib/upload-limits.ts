// Shared upload constraints used by BOTH client and server. Keep this module
// free of any "server-only" import so client components can use it too.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

export const UPLOAD_HELP_TEXT = "Image only, max 8MB";
export const OVERSIZE_ERROR = "Image must be smaller than 8MB.";
export const NOT_IMAGE_ERROR = "Only image files are allowed.";

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
