"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhotoGrid, type GridPhoto } from "@/components/photo-grid";
import { checkImageFile, UPLOAD_HELP_TEXT } from "@/lib/upload-limits";
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
}: {
  defectId: string;
  status: DefectStatusValue;
  completionPhotos: GridPhoto[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submitPhoto(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    // Client-side guard so oversized photos never hit the Server Action body
    // limit — show a friendly message instead of a raw "Body exceeded" error.
    if (file instanceof File) {
      const err = checkImageFile(file);
      if (err) {
        setError(err);
        return;
      }
    }
    fd.set("defectId", defectId);
    setError(null);
    startTransition(async () => {
      const res = await uploadCompletionPhoto(fd);
      if (res.error) setError(res.error);
      else {
        form.reset();
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
            No completion photos yet.
          </p>
        )}

        {canUpload && (
          <form onSubmit={submitPhoto} className="flex flex-col gap-2">
            {/* capture="environment" opens the rear camera on mobile devices */}
            <Input
              type="file"
              name="file"
              accept="image/*"
              capture="environment"
              required
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">{UPLOAD_HELP_TEXT}</p>
            <Button type="submit" variant="outline" disabled={pending} className="w-full">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Add completion photo
            </Button>
          </form>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Workflow buttons */}
      {status === "ASSIGNED" && (
        <Button
          className="w-full"
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
        <Button
          className="w-full"
          size="lg"
          disabled={pending}
          onClick={() => runAction(() => markCompleted(defectId))}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Mark Completed
        </Button>
      )}

      {status === "COMPLETED" && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Marked as completed. Waiting for the main contractor to review.
        </p>
      )}

      {isClosed && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          This defect has been closed ({STATUS_LABEL.CLOSED}). No further action
          needed.
        </p>
      )}
    </div>
  );
}
