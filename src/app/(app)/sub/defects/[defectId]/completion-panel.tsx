"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MultiPhotoInput,
  appendPhotos,
  usePhotoFiles,
} from "@/components/photo-file-input";
import { PhotoGrid, type GridPhoto } from "@/components/photo-grid";
import { VideoPicker, uploadDefectVideo } from "@/components/short-video-input";
import { checkTotalUploadSize, UPLOAD_HELP_TEXT } from "@/lib/upload-limits";
import { STATUS_LABEL, type DefectStatusValue } from "@/lib/defect-ui";
import { uploadCompletionPhoto, startWork, markCompleted } from "./actions";

const NO_EVIDENCE_ERROR =
  "Upload at least one completion photo or video first.";

/**
 * Sub-con completion workflow, one-tap style: Start Work, then just select
 * completion photos/videos and tap the single primary button — it uploads all
 * pending media (existing uploadCompletionPhoto action + video API) and only
 * then calls the existing markCompleted action. No separate upload buttons.
 */
export function CompletionPanel({
  defectId,
  status,
  completionPhotos,
  completeLabel = "Mark Completed",
  stickyActions = false,
}: {
  defectId: string;
  status: DefectStatusValue;
  completionPhotos: GridPhoto[];
  /** Label for the primary complete button (the modal uses "Done"). */
  completeLabel?: string;
  /** Pin the workflow buttons to the bottom of a scrolling dialog. */
  stickyActions?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Selected-but-not-yet-uploaded completion photos: camera appends one per
  // capture, gallery can add several at once. Client-side type/size/limit
  // checks live in the hook; the server re-validates authoritatively.
  const photos = usePhotoFiles({ onError: setError });
  // Pending completion video (at most one). Uploaded by the Done tap, never
  // by a separate button. VideoPicker validates each pick.
  const [video, setVideo] = useState<File | null>(null);
  // Parent-owned refs for the hidden video inputs, clicked from the combined
  // Camera/Gallery action sheets in MultiPhotoInput.
  const videoCamRef = useRef<HTMLInputElement>(null);
  const videoGalRef = useRef<HTMLInputElement>(null);
  // Synchronous duplicate-submit guard: useTransition's `pending` only turns
  // true on the next render, so a rapid double-tap would pass a pending-only
  // check and upload/complete twice.
  const submittingRef = useRef(false);
  // What the Done tap is currently doing, for the button label.
  const [phase, setPhase] = useState<"idle" | "uploading" | "completing">(
    "idle",
  );

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  /**
   * One-tap complete: upload every pending photo/video first (reusing the
   * existing action/API), and only when ALL uploads succeeded call the
   * existing markCompleted action. Pending state is cleared per successful
   * step, so a retry after a failure never re-uploads saved evidence.
   */
  function handleDone() {
    if (pending || submittingRef.current) return;
    // Valid evidence = already-saved completion media OR a pending selection.
    if (completionPhotos.length === 0 && photos.items.length === 0 && !video) {
      setError(NO_EVIDENCE_ERROR);
      return;
    }
    const totalErr = checkTotalUploadSize(photos.items.map((it) => it.file));
    if (totalErr) {
      setError(totalErr);
      return;
    }
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      // On failure after a partial upload, refresh so the evidence that DID
      // save shows up in the grid (its pending state is already cleared).
      let uploadedSomething = false;
      const fail = (msg: string) => {
        setError(msg);
        if (uploadedSomething) router.refresh();
      };
      try {
        if (photos.items.length > 0) {
          setPhase("uploading");
          const fd = new FormData();
          appendPhotos(fd, photos.items);
          fd.set("defectId", defectId);
          const res = await uploadCompletionPhoto(fd);
          // Keep the selected files so the sub-con can retry.
          if (res.error) return fail(res.error);
          photos.clearFiles();
          uploadedSomething = true;
        }
        if (video) {
          setPhase("uploading");
          const res = await uploadDefectVideo(defectId, video);
          // Keep the selected video so the sub-con can retry.
          if (res.error) return fail(res.error);
          setVideo(null);
          uploadedSomething = true;
        }
        setPhase("completing");
        const res = await markCompleted(defectId);
        if (res.error) return fail(res.error);
        router.refresh();
      } finally {
        submittingRef.current = false;
        setPhase("idle");
      }
    });
  }

  const isClosed = status === "CLOSED";
  // Evidence selection only after work has started (or on a reopened defect) —
  // ASSIGNED shows just Start Work; COMPLETED/CLOSED stay read-only.
  const canUpload = status === "IN_PROGRESS" || status === "REOPENED";
  const hasEvidence =
    completionPhotos.length > 0 || photos.items.length > 0 || video !== null;

  return (
    <div className="space-y-4">
      {/* Completion evidence already saved */}
      <div className="space-y-2">
        {completionPhotos.length > 0 ? (
          <PhotoGrid photos={completionPhotos} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No completion photos or videos yet.
          </p>
        )}

        {/* Media selection only — no upload buttons. The fieldset disables
            Camera/Gallery, previews and remove buttons while Done runs. */}
        {canUpload && (
          <fieldset disabled={pending} className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Take or upload completion photos
            </p>
            <MultiPhotoInput
              items={photos.items}
              onAddFiles={photos.addFiles}
              onRemove={photos.removeFile}
              videoActions={{
                recordVideo: () => videoCamRef.current?.click(),
                chooseVideo: () => videoGalRef.current?.click(),
              }}
              videoSlot={
                <VideoPicker
                  file={video}
                  onSelect={(f) => {
                    setError(null);
                    setVideo(f);
                  }}
                  onRemove={() => setVideo(null)}
                  disabled={pending}
                  externalTriggers={{
                    cameraRef: videoCamRef,
                    galleryRef: videoGalRef,
                  }}
                />
              }
            />
            <p className="text-xs text-muted-foreground">
              {UPLOAD_HELP_TEXT}, up to 5 photos. Selected media is uploaded
              when you tap {completeLabel}.
            </p>
          </fieldset>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Workflow buttons. Only one status block renders at a time; inside the
          defect modal the wrapper sticks to the bottom of the scroll area so
          the primary action stays visible. */}
      <div
        className={
          stickyActions
            ? "sticky bottom-0 -mx-4 border-t bg-popover px-4 py-3"
            : undefined
        }
      >
      {status === "ASSIGNED" && (
        <Button
          className="w-full max-md:h-12"
          size="lg"
          disabled={pending}
          onClick={() => runAction(() => startWork(defectId))}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Start Work
        </Button>
      )}

      {canUpload && (
        <div className="space-y-2">
          {!hasEvidence && (
            <p className="text-xs text-muted-foreground">
              Add at least one completion photo or video, then tap{" "}
              {completeLabel}.
            </p>
          )}
          <Button
            className="w-full max-md:h-12"
            size="lg"
            disabled={pending}
            onClick={handleDone}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {phase === "uploading"
              ? "Uploading…"
              : phase === "completing"
                ? "Completing…"
                : completeLabel}
          </Button>
        </div>
      )}

      {status === "COMPLETED" && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Marked as completed. Waiting for the Main-Con to review.
        </p>
      )}

      {isClosed && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          This defect has been closed ({STATUS_LABEL.CLOSED}). No further action
          needed.
        </p>
      )}
      </div>
    </div>
  );
}
