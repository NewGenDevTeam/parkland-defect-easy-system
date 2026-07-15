"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MultiPhotoInput,
  appendPhotos,
  usePhotoFiles,
} from "@/components/photo-file-input";
import { PhotoGrid, type GridPhoto } from "@/components/photo-grid";
import { ShortVideoInput } from "@/components/short-video-input";
import {
  checkTotalUploadSize,
  NO_FILES_ERROR,
  UPLOAD_HELP_TEXT,
} from "@/lib/upload-limits";
import {
  STATUS_LABEL,
  type DefectStatusValue,
} from "@/lib/defect-ui";
import {
  uploadCompletionPhoto,
  startWork,
  markCompleted,
} from "./actions";

/**
 * Sub-con completion workflow: upload proof photos (with mobile camera capture)
 * and move the defect through Start Work -> Mark Completed.
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
  // Parent-owned refs for the hidden video inputs, clicked from the combined
  // Camera/Gallery action sheets in MultiPhotoInput.
  const videoCamRef = useRef<HTMLInputElement>(null);
  const videoGalRef = useRef<HTMLInputElement>(null);

  function submitPhotos(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (photos.items.length === 0) {
      setError(NO_FILES_ERROR);
      return;
    }
    const totalErr = checkTotalUploadSize(photos.items.map((it) => it.file));
    if (totalErr) {
      setError(totalErr);
      return;
    }
    const fd = new FormData();
    appendPhotos(fd, photos.items);
    fd.set("defectId", defectId);
    setError(null);
    startTransition(async () => {
      const res = await uploadCompletionPhoto(fd);
      // Upload failed: keep the selected files so the sub-con can retry.
      if (res.error) setError(res.error);
      else {
        photos.clearFiles();
        router.refresh();
      }
    });
  }

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const isClosed = status === "CLOSED";
  const canUpload = !isClosed && status !== "COMPLETED";

  return (
    <div className="space-y-4">
      {/* Completion photos */}
      <div className="space-y-2">
        {completionPhotos.length > 0 ? (
          <PhotoGrid photos={completionPhotos} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No Completion Photos yet.
          </p>
        )}

        {canUpload && (
          <form onSubmit={submitPhotos} className="flex flex-col gap-2">
            <p className="text-sm font-medium">Take or upload completion photos</p>
            <MultiPhotoInput
              items={photos.items}
              onAddFiles={photos.addFiles}
              onRemove={photos.removeFile}
              videoActions={{
                recordVideo: () => videoCamRef.current?.click(),
                chooseVideo: () => videoGalRef.current?.click(),
              }}
              videoSlot={
                <ShortVideoInput
                  defectId={defectId}
                  externalTriggers={{
                    cameraRef: videoCamRef,
                    galleryRef: videoGalRef,
                  }}
                />
              }
            />
            <p className="text-xs text-muted-foreground">
              Take or upload completion photos. {UPLOAD_HELP_TEXT}, up to 5
              photos per upload.
            </p>
            {photos.items.length > 0 && (
              <Button type="submit" variant="outline" disabled={pending} className="w-full">
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Upload {photos.items.length} Completion Photo
                {photos.items.length > 1 ? "s" : ""}
              </Button>
            )}
          </form>
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

      {(status === "IN_PROGRESS" || status === "REOPENED") && (
        <div className="space-y-2">
          {completionPhotos.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Upload at least one Completion Photo before marking this Defect
              completed.
            </p>
          )}
          <Button
            className="w-full max-md:h-12"
            size="lg"
            disabled={pending}
            onClick={() => runAction(() => markCompleted(defectId))}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {completeLabel}
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
