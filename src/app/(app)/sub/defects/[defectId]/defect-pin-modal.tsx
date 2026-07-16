"use client";

import { useState } from "react";
import { FolderKanban, Layers, MapPin, UserRound } from "lucide-react";
import { FloorPlanViewer } from "@/components/floor-plan-viewer";
import { PhotoGrid, type GridPhoto } from "@/components/photo-grid";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_BADGE_CLASS,
  PRIORITY_BADGE_CLASS,
  STATUS_PIN_COLOR,
  type DefectStatusValue,
  type PriorityValue,
} from "@/lib/defect-ui";
import { formatMalaysiaDate } from "@/lib/format-date";
import { CompletionPanel } from "./completion-panel";

export type ModalDefect = {
  id: string;
  title: string;
  description: string | null;
  trade: string | null;
  priority: PriorityValue;
  status: DefectStatusValue;
  x: number;
  y: number;
  reopenReason: string | null;
  createdAt: string;
  projectName: string;
  projectLocation: string | null;
  drawingName: string;
  assignedToLabel: string | null;
};

/**
 * Sub-Con floor plan with a clickable defect pin. Tapping the pin opens the
 * defect detail dialog (same pattern as the Main-Con drawing board) with the
 * full defect info and the existing CompletionPanel workflow inside — no
 * navigation, no scrolling, and the viewer keeps its zoom/pan state because it
 * stays mounted while the dialog is open.
 */
export function DefectPinModal({
  imageUrl,
  defect,
  defectPhotos,
  completionPhotos,
}: {
  imageUrl: string;
  defect: ModalDefect;
  defectPhotos: GridPhoto[];
  completionPhotos: GridPhoto[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Read-only viewer: auto-zooms and centers on this defect's pin.
          Sub-Con can pan/zoom but cannot add or move pins. */}
      <FloorPlanViewer
        imageUrl={imageUrl}
        pins={[
          {
            id: defect.id,
            x: defect.x,
            y: defect.y,
            colorClass: STATUS_PIN_COLOR[defect.status],
            title: defect.title,
          },
        ]}
        selectedPinId={defect.id}
        focusPoint={{ x: defect.x, y: defect.y }}
        onSelectPin={() => setOpen(true)}
      />
      <p className="text-xs text-muted-foreground">
        Tap the highlighted pin to open the defect and complete the work.
      </p>

      {/* Defect detail dialog — same responsive style as the Main-Con board.
          Data comes straight from server props, so router.refresh() after
          Start Work / uploads / Done updates the open dialog in place. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{defect.title}</DialogTitle>
            <DialogDescription>
              Created {formatMalaysiaDate(defect.createdAt)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge className={STATUS_BADGE_CLASS[defect.status]}>
                {STATUS_LABEL[defect.status]}
              </Badge>
              <Badge className={PRIORITY_BADGE_CLASS[defect.priority]}>
                {PRIORITY_LABEL[defect.priority]} priority
              </Badge>
              {defect.trade && <Badge variant="outline">{defect.trade}</Badge>}
            </div>

            <div className="space-y-1.5 text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <FolderKanban className="h-4 w-4 shrink-0" />
                {defect.projectName}
              </p>
              {defect.projectLocation && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {defect.projectLocation}
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 shrink-0" />
                {defect.drawingName}
              </p>
              <p className="flex items-center gap-1.5">
                <UserRound className="h-4 w-4 shrink-0" />
                {defect.assignedToLabel
                  ? `Assigned to ${defect.assignedToLabel}`
                  : "Not assigned to any Sub-Con yet"}
              </p>
            </div>

            {defect.description && (
              <p className="text-muted-foreground">{defect.description}</p>
            )}

            {defect.status === "REOPENED" && defect.reopenReason && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950 dark:text-red-300">
                <span className="font-medium">Reopen reason:</span>{" "}
                {defect.reopenReason}
              </p>
            )}

            {/* Original defect evidence from the Main-Con */}
            <div className="space-y-2 border-t pt-3">
              <p className="font-medium">Defect Photos &amp; Videos</p>
              {defectPhotos.length > 0 ? (
                <PhotoGrid photos={defectPhotos} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  No defect photos yet.
                </p>
              )}
            </div>

            {/* Completion workflow — the existing panel (Start Work, photo /
                video evidence uploads, completion) with the primary action
                labelled "Done" and kept visible at the bottom. */}
            <div className="space-y-2 border-t pt-3">
              <p className="font-medium">Completion</p>
              <CompletionPanel
                defectId={defect.id}
                status={defect.status}
                completionPhotos={completionPhotos}
                completeLabel="Done"
                stickyActions
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
