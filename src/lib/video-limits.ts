// Shared short-video upload constraints used by BOTH client and server. Keep
// this module free of any "server-only" import so client components can use
// it too (same pattern as upload-limits.ts).

export const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30MB per video

// Formats commonly produced by phone cameras and desktop browsers.
// iPhone records .mov (video/quicktime), Android records .mp4, screen
// recorders often produce .webm.
export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"] as const;

// Preferred stored extension by MIME type (never trust the uploaded name).
export const VIDEO_EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

// The accept list for the Record Short Video input.
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";

export const VIDEO_GUIDANCE =
  "Please record a short video, recommended below 30 seconds";
export const VIDEO_OVERSIZE_ERROR = "The video must be smaller than 30MB.";
export const VIDEO_FORMAT_ERROR =
  "Only MP4, MOV or WebM video files are allowed.";
export const NO_VIDEO_ERROR = "Select or record a video first.";

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

/**
 * Type + size check shared by client (pre-check before the request) and
 * server (authoritative re-check). MIME type is checked when the browser
 * provides one; the file extension must be on the whitelist either way, so a
 * renamed .exe never passes on an empty MIME type.
 */
export function checkVideoFile(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  const mimeOk = (VIDEO_MIME_TYPES as readonly string[]).includes(file.type);
  const extOk = (VIDEO_EXTENSIONS as readonly string[]).includes(
    extOf(file.name),
  );
  // Accept when the MIME type is a known video type, or when the browser did
  // not report a useful type but the extension is on the whitelist.
  if (!mimeOk && !(extOk && (file.type === "" || file.type.startsWith("video/")))) {
    return VIDEO_FORMAT_ERROR;
  }
  if (file.size > MAX_VIDEO_BYTES) return VIDEO_OVERSIZE_ERROR;
  return null;
}
