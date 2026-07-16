"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2, Loader2, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoarsePointer } from "@/components/photo-file-input";
import {
  checkVideoFile,
  NO_VIDEO_ERROR,
  VIDEO_ACCEPT,
  VIDEO_GUIDANCE,
} from "@/lib/video-limits";

/**
 * Shared short-video selection UI.
 *
 * Two SEPARATE hidden inputs (never one shared input): the camera input has
 * `capture="environment"` (opens the phone's rear camera in video mode where
 * supported), the gallery input has NO capture attribute — on some mobile
 * browsers `capture` forces the camera and blocks Gallery/Photos selection.
 *
 * Trigger modes:
 * - Own buttons (default), by device (coarse-pointer detection — the same
 *   capability check the photo Take Photo button uses, not screen width):
 *   Desktop shows `Choose Video` only; mobile shows `Record Video` +
 *   `Choose Video`.
 * - externalTriggers: renders NO buttons of its own — the parent owns the
 *   two input refs and clicks them from the combined Camera/Gallery action
 *   sheets in MultiPhotoInput. The chip/error/guidance block still renders.
 *
 * Both actions feed the SAME single selected-video state via onSelect:
 * picking again (either input) replaces the current selection after
 * validation; invalid picks keep the current selection and show the error.
 */
export function VideoPicker({
  file,
  onSelect,
  onRemove,
  disabled = false,
  actions,
  externalTriggers,
  chipOnly = false,
}: {
  /** The single selected video (shared by Record Video and Choose Video). */
  file: File | null;
  /** Called with a validated file — replaces any previous selection. */
  onSelect: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
  /** Optional controls (e.g. an Upload button) rendered under the chip. */
  actions?: React.ReactNode;
  /**
   * Parent-owned refs for the two hidden video inputs (camera / gallery).
   * When set, VideoPicker renders no buttons — the parent's Camera/Gallery
   * UI clicks these refs instead.
   */
  externalTriggers?: {
    cameraRef: RefObject<HTMLInputElement | null>;
    galleryRef: RefObject<HTMLInputElement | null>;
  };
  /**
   * Render ONLY the selected-file chip / error / guidance block — no buttons
   * and no hidden inputs. Used by the Add Defect media-step flow, where the
   * parent mounts its own always-available inputs (they must exist before
   * this component does) and validates picks itself.
   */
  chipOnly?: boolean;
}) {
  const isCoarse = useCoarsePointer();
  const internalCameraRef = useRef<HTMLInputElement>(null);
  const internalGalleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = externalTriggers?.cameraRef ?? internalCameraRef;
  const galleryRef = externalTriggers?.galleryRef ?? internalGalleryRef;
  const [pickError, setPickError] = useState<string | null>(null);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const picked = input.files?.[0];
    // Reset so recording/choosing the same file again fires onChange again.
    input.value = "";
    if (!picked) return; // camera/picker cancelled — keep current selection
    const invalid = checkVideoFile(picked);
    if (invalid) {
      setPickError(invalid);
      return;
    }
    setPickError(null);
    onSelect(picked);
  }

  return (
    <>
      {!externalTriggers && !chipOnly && (
        <>
          {isCoarse && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-11 max-md:px-3"
              disabled={disabled}
              onClick={() => cameraRef.current?.click()}
            >
              <Video className="h-4 w-4" />
              Record Video
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-11 max-md:px-3"
            disabled={disabled}
            onClick={() => galleryRef.current?.click()}
          >
            <FilePlus2 className="h-4 w-4" />
            Choose Video
          </Button>
        </>
      )}

      {/* Hidden inputs. Two SEPARATE inputs (camera w/ capture, gallery
          without) — never one shared input. Selecting a video only updates
          local state — nothing submits or navigates. The camera input is
          mounted whenever it can be triggered (coarse pointer, or a parent
          holding the ref). */}
      {!chipOnly && (isCoarse || externalTriggers) && (
        <input
          ref={cameraRef}
          type="file"
          accept={VIDEO_ACCEPT}
          capture="environment"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handlePick}
        />
      )}
      {!chipOnly && (
        <input
          ref={galleryRef}
          type="file"
          accept={VIDEO_ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handlePick}
        />
      )}

      {/* Wraps onto its own line inside the flex-wrap button row. */}
      <div className="w-full space-y-2">
        {file && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 animate-in fade-in-0 duration-300">
            <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {(file.size / (1024 * 1024)).toFixed(1)}MB
            </span>
            {!disabled && (
              <button
                type="button"
                aria-label="Remove selected video"
                onClick={onRemove}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        {actions}
        {pickError && <p className="text-sm text-destructive animate-in fade-in-0 duration-300">{pickError}</p>}
        <p className="text-xs text-muted-foreground">
          {VIDEO_GUIDANCE} (MP4, MOV or WebM, max 30MB).
        </p>
      </div>
    </>
  );
}

/**
 * Upload ONE short video for an existing defect to
 * POST /api/defects/<id>/videos — a Route Handler, because a 30MB video must
 * not compete with the Server Action body limit sized for photo batches, and
 * XMLHttpRequest gives real upload progress. The server stores it as a Photo
 * row with media = VIDEO, so it appears with the existing evidence.
 * Uploading never changes the defect status.
 *
 * Validates the file first and resolves with {} or { error } — never rejects —
 * so callers (ShortVideoInput below, the Sub-Con one-tap Done flow) can
 * simply await it.
 */
export function uploadDefectVideo(
  defectId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ error?: string }> {
  const invalid = checkVideoFile(file);
  if (invalid) return Promise.resolve({ error: invalid });
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.set("video", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/defects/${defectId}/videos`);
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({});
      try {
        const data = JSON.parse(xhr.responseText) as { error?: string };
        resolve({ error: data.error ?? "Upload failed. Please try again." });
      } catch {
        resolve({ error: "Upload failed. Please try again." });
      }
    };
    xhr.onerror = () =>
      resolve({ error: "Network problem — the video was not uploaded." });
    xhr.send(fd);
  });
}

/**
 * Short-video upload with its own Upload button (Main-Con detail dialog):
 * VideoPicker plus an immediate upload via uploadDefectVideo above.
 */
export function ShortVideoInput({
  defectId,
  externalTriggers,
}: {
  defectId: string;
  /** Passed through to VideoPicker — see its docs. */
  externalTriggers?: {
    cameraRef: RefObject<HTMLInputElement | null>;
    galleryRef: RefObject<HTMLInputElement | null>;
  };
}) {
  const router = useRouter();
  // Synchronous duplicate-submit guard (state alone lags a render behind).
  const uploadingRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleUpload() {
    if (uploadingRef.current) return;
    if (!file) {
      setError(NO_VIDEO_ERROR);
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    setProgress(0);
    setError(null);
    const res = await uploadDefectVideo(defectId, file, setProgress);
    uploadingRef.current = false;
    setUploading(false);
    if (res.error) {
      // Keep the selected file so the user can retry.
      setError(res.error);
    } else {
      setFile(null);
      toast.success("Video uploaded", { duration: 1500 });
      router.refresh();
    }
  }

  return (
    <VideoPicker
      file={file}
      onSelect={(f) => {
        setError(null);
        setFile(f);
      }}
      onRemove={() => setFile(null)}
      disabled={uploading}
      externalTriggers={externalTriggers}
      actions={
        <>
          {uploading && (
            <div className="space-y-1 animate-in fade-in-0 duration-300">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Uploading… {progress}%
              </p>
            </div>
          )}
          {file && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full max-md:h-11"
              disabled={uploading}
              onClick={handleUpload}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Video className="h-4 w-4" />
              )}
              {uploading ? "Uploading…" : "Upload Video"}
            </Button>
          )}
          {error && <p className="text-sm text-destructive animate-in fade-in-0 duration-300">{error}</p>}
        </>
      }
    />
  );
}
