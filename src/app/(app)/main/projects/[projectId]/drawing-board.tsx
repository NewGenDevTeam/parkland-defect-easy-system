"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hand, ImageUp, ImagePlus, Loader2, MapPin, UserRound } from "lucide-react";
import {
  createDefect,
  updateDefect,
  uploadDrawing,
  uploadDefectPhoto,
  reviewDefect,
} from "../actions";
import { PhotoGrid, type GridPhoto } from "@/components/photo-grid";
import {
  MultiPhotoInput,
  appendPhotos,
  useCoarsePointer,
  usePhotoFiles,
} from "@/components/photo-file-input";
import { FloorPlanViewer } from "@/components/floor-plan-viewer";
import {
  checkImageFile,
  checkTotalUploadSize,
  NO_FILES_ERROR,
  UPLOAD_HELP_TEXT,
} from "@/lib/upload-limits";
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_PIN_COLOR,
  STATUS_BADGE_CLASS,
  PRIORITY_BADGE_CLASS,
  MAIN_STATUS_OPTIONS,
  type DefectStatusValue,
  type PriorityValue,
} from "@/lib/defect-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type BoardDefect = {
  id: string;
  pinNumber: number;
  title: string;
  description: string | null;
  trade: string | null;
  priority: PriorityValue;
  status: DefectStatusValue;
  x: number;
  y: number;
  assignedToId: string | null;
  assignedToName: string | null;
  reopenReason: string | null;
  createdAt: string;
  defectPhotos: GridPhoto[];
  completionPhotos: GridPhoto[];
};

// label = "Company — Department" (or team name), built server-side.
type SubCon = { id: string; label: string };

// Native <select>. The option popup is drawn by the browser, so we explicitly
// color the options to keep the dropdown readable in dark mode.
const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-popover [&>option]:text-popover-foreground";

export function DrawingBoard({
  projectId,
  drawing,
  defects,
  subCons,
  initialDefectId = null,
}: {
  projectId: string;
  drawing: { id: string; imageUrl: string } | null;
  defects: BoardDefect[];
  subCons: SubCon[];
  initialDefectId?: string | null;
}) {
  if (!drawing) {
    return <UploadDrawing projectId={projectId} />;
  }
  return (
    <Board
      projectId={projectId}
      drawing={drawing}
      defects={defects}
      subCons={subCons}
      initialDefectId={initialDefectId}
    />
  );
}

// --- Empty state / upload -------------------------------------------------

function UploadDrawing({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(uploadDrawing, {});
  const [clientError, setClientError] = useState<string | null>(null);

  // Client-side guard: block oversized/non-image files before the Server Action
  // body limit rejects them, so the user sees a friendly message.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const input = e.currentTarget.elements.namedItem("file");
    const file =
      input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (file) {
      const err = checkImageFile(file);
      if (err) {
        e.preventDefault();
        setClientError(err);
        return;
      }
    }
    setClientError(null);
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-10 text-center">
      <ImageUp className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="font-medium">No Floor Plan yet</p>
        <p className="text-sm text-muted-foreground">
          Upload a Floor Plan to start adding Defect pins.
        </p>
      </div>
      <form
        action={formAction}
        onSubmit={handleSubmit}
        className="flex flex-col items-center gap-3"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <Input
          type="file"
          name="file"
          accept="image/*"
          required
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground">{UPLOAD_HELP_TEXT}</p>
        {(clientError ?? state.error) && (
          <p className="text-sm text-destructive">
            {clientError ?? state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Upload Floor Plan
        </Button>
      </form>
    </div>
  );
}

// --- Board with pins ------------------------------------------------------

function Board({
  projectId,
  drawing,
  defects,
  subCons,
  initialDefectId,
}: {
  projectId: string;
  drawing: { id: string; imageUrl: string };
  defects: BoardDefect[];
  subCons: SubCon[];
  initialDefectId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // "view" = pan/zoom; "place" = the next tap on the plan drops a defect pin.
  const [mode, setMode] = useState<"view" | "place">("view");
  const [createPos, setCreatePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  // Store the id, not the object, so the open dialog reflects fresh server data
  // (new photos, status changes) after router.refresh().
  // Seeded from ?defectId= so links from /main/defects open the pin directly.
  const [selectedId, setSelectedId] = useState<string | null>(initialDefectId);
  const selected = defects.find((d) => d.id === selectedId) ?? null;
  const [reopenReason, setReopenReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Photos for the NEW defect being created. Held in state (not form fields)
  // so the camera can be opened straight from the pin-placement tap, each
  // capture APPENDS to the list, and the selection survives leaving/returning
  // to Safari. Previews are local object URLs — never the /uploads URL, which
  // only exists after saving.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const createPhotos = usePhotoFiles({ onError: setError });
  // Additional photos for an EXISTING defect (detail dialog form).
  const detailPhotos = usePhotoFiles({ onError: setError });
  // Decides whether the camera opens automatically and Take Photo shows.
  const isCoarse = useCoarsePointer();

  // Escape exits Add Defect Pin mode.
  useEffect(() => {
    if (mode !== "place") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("view");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  function handlePlacePin(x: number, y: number) {
    setError(null);
    createPhotos.clearFiles();
    setCreatePos({ x, y });
    // Auto-exit place mode; the Add Defect modal opens for this position.
    setMode("view");
    // Camera-first mobile flow: open the phone camera from the SAME user tap
    // (iOS only allows programmatic file-input clicks inside a user gesture).
    // Desktop (fine pointer) just shows the form with its photo buttons.
    if (isCoarse) cameraInputRef.current?.click();
  }

  // Closing the Add Defect dialog (Cancel / backdrop / after save) removes
  // the temporary pin and any captured-but-unsaved photos.
  function closeCreate() {
    setCreatePos(null);
    createPhotos.clearFiles();
    setError(null);
  }

  function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // pending guard: a double-tap on Add defect must not create two defects.
    if (!createPos || pending) return;
    const fd = new FormData(e.currentTarget);
    // Optional photos travel from state (captured via the hidden camera /
    // gallery inputs), re-checked here before the Server Action body limit
    // could turn an oversized file into a raw error.
    for (const it of createPhotos.items) {
      const err = checkImageFile(it.file);
      if (err) {
        setError(err);
        return;
      }
    }
    const totalErr = checkTotalUploadSize(createPhotos.items.map((it) => it.file));
    if (totalErr) {
      setError(totalErr);
      return;
    }
    appendPhotos(fd, createPhotos.items);
    fd.set("projectId", projectId);
    fd.set("drawingId", drawing.id);
    fd.set("x", String(createPos.x));
    fd.set("y", String(createPos.y));
    setError(null);
    startTransition(async () => {
      const res = await createDefect(fd);
      if (res.error) {
        // Keep the dialog (and pin + photo) so the user can fix and retry.
        setError(res.error);
      } else {
        closeCreate();
        router.refresh();
      }
    });
  }

  function submitUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateDefect({
        defectId: selected.id,
        projectId,
        assignedToId: String(fd.get("assignedToId") ?? ""),
        status: String(fd.get("status") ?? selected.status),
      });
      if (res.error) {
        setError(res.error);
      } else {
        closeDetail();
        router.refresh();
      }
    });
  }

  function submitDefectPhoto(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || pending) return;
    if (detailPhotos.items.length === 0) {
      setError(NO_FILES_ERROR);
      return;
    }
    const totalErr = checkTotalUploadSize(detailPhotos.items.map((it) => it.file));
    if (totalErr) {
      setError(totalErr);
      return;
    }
    const fd = new FormData();
    appendPhotos(fd, detailPhotos.items);
    fd.set("defectId", selected.id);
    fd.set("projectId", projectId);
    setError(null);
    startTransition(async () => {
      const res = await uploadDefectPhoto(fd);
      if (res.error) {
        // Keep the dialog and the selected files so the user can retry.
        setError(res.error);
      } else {
        detailPhotos.clearFiles();
        router.refresh();
      }
    });
  }

  function submitReview(action: "CLOSE" | "REOPEN") {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await reviewDefect({
        defectId: selected.id,
        projectId,
        action,
        reopenReason,
      });
      if (res.error) {
        setError(res.error);
      } else {
        closeDetail();
        router.refresh();
      }
    });
  }

  function closeDetail() {
    setSelectedId(null);
    setReopenReason("");
    detailPhotos.clearFiles();
    setError(null);
  }

  return (
    <div className="space-y-3">
      {/* Always-mounted hidden camera input for the Add Defect flow. Kept
          outside the dialog so the camera can open in the same tap that
          places the pin (the dialog's own inputs don't exist yet at that
          moment). One capture per launch; each capture APPENDS to the list.
          Selecting a photo only updates state — never submits or navigates. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const input = e.currentTarget;
          createPhotos.addFiles(input.files);
          // Reset so retaking the same photo fires onChange again.
          input.value = "";
        }}
      />
      <FloorPlanViewer
        imageUrl={drawing.imageUrl}
        mode={mode}
        onPlacePin={handlePlacePin}
        onSelectPin={(id) => {
          setError(null);
          setReopenReason("");
          setSelectedId(id);
        }}
        selectedPinId={selectedId}
        draftPin={createPos}
        pins={defects.map((d) => ({
          id: d.id,
          x: d.x,
          y: d.y,
          label: d.pinNumber,
          colorClass: STATUS_PIN_COLOR[d.status],
          title: `#${d.pinNumber} ${d.title}`,
        }))}
        toolbarStart={
          <>
            <Button
              type="button"
              size="sm"
              className="max-md:h-11 max-md:px-3"
              variant={mode === "view" ? "default" : "outline"}
              onClick={() => setMode("view")}
            >
              <Hand className="h-4 w-4" />
              View / Move
            </Button>
            <Button
              type="button"
              size="sm"
              className="max-md:h-11 max-md:px-3"
              variant={mode === "place" ? "default" : "outline"}
              onClick={() => setMode(mode === "place" ? "view" : "place")}
            >
              <MapPin className="h-4 w-4" />
              Add Defect Pin
            </Button>
          </>
        }
      />
      <p className="text-sm text-muted-foreground">
        {mode === "place"
          ? "Zoom to the affected area, then click the exact defect location. Press Escape or Add Defect Pin again to cancel."
          : "Drag to pan and zoom in for detail. Click a pin to open the defect. Use Add Defect Pin to add a new one."}
      </p>

      {/* Create defect dialog */}
      <Dialog
        open={createPos !== null}
        onOpenChange={(o) => !o && closeCreate()}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add defect</DialogTitle>
            <DialogDescription>
              Pin placed on the floor plan. Fill in the details below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" name="title" required placeholder="e.g. Cracked tile" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trade">Category / Trade *</Label>
              <Input id="trade" name="trade" required placeholder="e.g. Tiling" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={2} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label>Defect Photos</Label>
              <MultiPhotoInput
                items={createPhotos.items}
                onAddFiles={createPhotos.addFiles}
                onRemove={createPhotos.removeFile}
                cameraInputRef={cameraInputRef}
              />
              <p className="text-xs text-muted-foreground">
                Take or upload defect photos. {UPLOAD_HELP_TEXT}, up to 5 photos.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <select id="priority" name="priority" defaultValue="MEDIUM" className={selectClass}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignedToId">Assign Sub-Con</Label>
                <select id="assignedToId" name="assignedToId" defaultValue="" className={selectClass}>
                  <option value="">Unassigned</option>
                  {subCons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeCreate}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Add defect
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Defect detail dialog */}
      <Dialog
        open={selectedId !== null}
        onOpenChange={(o) => !o && closeDetail()}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  #{selected.pinNumber} {selected.title}
                </DialogTitle>
                <DialogDescription>
                  Created {new Date(selected.createdAt).toLocaleDateString()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge className={STATUS_BADGE_CLASS[selected.status]}>
                    {STATUS_LABEL[selected.status]}
                  </Badge>
                  <Badge className={PRIORITY_BADGE_CLASS[selected.priority]}>
                    {PRIORITY_LABEL[selected.priority]} priority
                  </Badge>
                  {selected.trade && <Badge variant="outline">{selected.trade}</Badge>}
                </div>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <UserRound className="h-4 w-4" />
                  {selected.assignedToName
                    ? `Assigned to ${selected.assignedToName}`
                    : "Not assigned to any Sub-Con yet"}
                </p>
                {selected.description && (
                  <p className="text-muted-foreground">{selected.description}</p>
                )}
                {selected.status === "REOPENED" && selected.reopenReason && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950 dark:text-red-300">
                    <span className="font-medium">Reopen reason:</span>{" "}
                    {selected.reopenReason}
                  </p>
                )}

                {/* Defect reference photos */}
                <div className="space-y-2 border-t pt-3">
                  <p className="font-medium">Defect Photos</p>
                  {selected.defectPhotos.length > 0 ? (
                    <PhotoGrid photos={selected.defectPhotos} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No defect photos yet.
                    </p>
                  )}
                  <form onSubmit={submitDefectPhoto} className="space-y-2">
                    <p className="text-sm font-medium">Take / Upload Photos</p>
                    <MultiPhotoInput
                      items={detailPhotos.items}
                      onAddFiles={detailPhotos.addFiles}
                      onRemove={detailPhotos.removeFile}
                    />
                    {detailPhotos.items.length > 0 && (
                      <Button type="submit" variant="outline" disabled={pending}>
                        {pending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                        Save defect photo{detailPhotos.items.length > 1 ? "s" : ""}
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Take or upload defect photos. {UPLOAD_HELP_TEXT}, up to 5
                      photos per save.
                    </p>
                  </form>
                </div>

                {/* Completion photos (sub-con proof of fix) */}
                <div className="space-y-2 border-t pt-3">
                  <p className="font-medium">Completion Photos</p>
                  {selected.completionPhotos.length > 0 ? (
                    <PhotoGrid photos={selected.completionPhotos} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No Completion Photos yet. The Sub-Con uploads these as
                      proof of fix.
                    </p>
                  )}
                </div>

                {/* Review actions for completed work */}
                {selected.status === "COMPLETED" && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="font-medium">Review completed work</p>
                    <Textarea
                      rows={2}
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="Reason for reopening (optional)"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        onClick={() => submitReview("CLOSE")}
                        disabled={pending}
                      >
                        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Close Defect
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => submitReview("REOPEN")}
                        disabled={pending}
                      >
                        Reopen Defect
                      </Button>
                    </div>
                  </div>
                )}

                <form onSubmit={submitUpdate} className="space-y-3 border-t pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="d-assigned">Assigned Sub-Con</Label>
                      <select
                        id="d-assigned"
                        name="assignedToId"
                        defaultValue={selected.assignedToId ?? ""}
                        className={selectClass}
                      >
                        <option value="">Unassigned</option>
                        {/* Deactivated assignee stays selectable as-is so
                            saving other fields never silently unassigns. */}
                        {selected.assignedToId &&
                          !subCons.some((s) => s.id === selected.assignedToId) && (
                            <option value={selected.assignedToId}>
                              {selected.assignedToName ?? "Assigned Sub-Con"} (inactive)
                            </option>
                          )}
                        {subCons.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="d-status">Status</Label>
                      <select
                        id="d-status"
                        name="status"
                        defaultValue={selected.status}
                        className={selectClass}
                      >
                        {MAIN_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeDetail}
                    >
                      Close
                    </Button>
                    <Button type="submit" disabled={pending}>
                      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save changes
                    </Button>
                  </DialogFooter>
                </form>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
