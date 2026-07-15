"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FilePlus2,
  Hand,
  Image as ImageIcon,
  Images,
  ImageUp,
  ImagePlus,
  Loader2,
  MapPin,
  UserRound,
  Video,
} from "lucide-react";
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
import { ShortVideoInput, VideoPicker } from "@/components/short-video-input";
import { checkVideoFile, VIDEO_ACCEPT } from "@/lib/video-limits";
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

// Active, project-scoped Defect Types for the Quick Add dropdown.
export type DefectTypeOption = {
  id: string;
  name: string;
  isOthers: boolean;
  defaultSubConId: string | null;
};

// Native <select>. The option popup is drawn by the browser, so we explicitly
// color the options to keep the dropdown readable in dark mode.
const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-popover [&>option]:text-popover-foreground";

export function DrawingBoard({
  projectId,
  drawing,
  drawingLabel = "",
  isMaster = false,
  defects,
  defectTypes,
  subCons,
  initialDefectId = null,
}: {
  projectId: string;
  drawing: { id: string; imageUrl: string } | null;
  /** "Project — Unit" line shown in the Quick Add form. */
  drawingLabel?: string;
  /** Master Layout is for picking a unit — no defect placement on it. */
  isMaster?: boolean;
  defects: BoardDefect[];
  defectTypes: DefectTypeOption[];
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
      drawingLabel={drawingLabel}
      isMaster={isMaster}
      defects={defects}
      defectTypes={defectTypes}
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
          name="name"
          maxLength={60}
          placeholder="Layout Name, e.g. A-11 (optional)"
          className="max-w-xs"
        />
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
  drawingLabel,
  isMaster,
  defects,
  defectTypes,
  subCons,
  initialDefectId,
}: {
  projectId: string;
  drawing: { id: string; imageUrl: string };
  drawingLabel: string;
  isMaster: boolean;
  defects: BoardDefect[];
  defectTypes: DefectTypeOption[];
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
  // Quick Add selections. Controlled so a Defect Type's default Sub-Con can be
  // preselected, and both survive between defects — registering 30–100 similar
  // defects in a row needs zero re-typing.
  const [typeId, setTypeId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [showNote, setShowNote] = useState(false);
  // Note + custom defect name are controlled so they survive the form step
  // unmounting during a Change Media round-trip (both still submit through
  // the form's FormData via their name attributes).
  const [note, setNote] = useState("");
  const [customName, setCustomName] = useState("");
  const selectedType = defectTypes.find((t) => t.id === typeId) ?? null;
  // Store the id, not the object, so the open dialog reflects fresh server data
  // (new photos, status changes) after router.refresh().
  // Seeded from ?defectId= so links from /main/defects open the pin directly.
  const [selectedId, setSelectedId] = useState<string | null>(initialDefectId);
  const selected = defects.find((d) => d.id === selectedId) ?? null;
  const [reopenReason, setReopenReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Synchronous in-flight flag for the Quick Add submit (see submitCreate).
  const submittingRef = useRef(false);

  // Add Defect dialog steps. Placing a pin no longer opens the camera
  // directly: the user first picks a media TYPE (Photo / Video), then a
  // SOURCE (camera / gallery), and only then sees the defect form. All steps
  // live inside the ONE dialog so the pin position and form state survive.
  const [createStep, setCreateStep] = useState<
    "media-type" | "media-source" | "form"
  >("media-type");
  const [mediaType, setMediaType] = useState<"photo" | "video" | null>(null);
  // Snapshot of the selection when entering the source step, so we advance to
  // the form only when a NEW pick lands (not because media already existed
  // after a Change Media round-trip).
  const sourceBaseline = useRef<{ photos: number; video: File | null }>({
    photos: 0,
    video: null,
  });
  // Photos for the NEW defect being created. Held in state (not form fields)
  // so the selection survives leaving/returning to Safari. Previews are local
  // object URLs — never the /uploads URL, which only exists after saving.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Gallery photo input for the media-source step (the form's own gallery
  // input doesn't exist yet at that moment).
  const createGalleryRef = useRef<HTMLInputElement>(null);
  const createPhotos = usePhotoFiles({ onError: setError });
  // Optional short video for the NEW defect. Deferred upload: the video needs
  // the defectId, so it is sent to /api/defects/<id>/videos only AFTER the
  // defect has been created (never before).
  const [createVideo, setCreateVideo] = useState<File | null>(null);
  // Hidden video inputs. The create pair is board-mounted (always available,
  // clicked from the Add Defect media-source step); the detail pair is owned
  // by the detail dialog's VideoPicker and clicked from its combined
  // Camera/Gallery action sheets in MultiPhotoInput.
  const createVideoCamRef = useRef<HTMLInputElement>(null);
  const createVideoGalRef = useRef<HTMLInputElement>(null);
  const detailVideoCamRef = useRef<HTMLInputElement>(null);
  const detailVideoGalRef = useRef<HTMLInputElement>(null);
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
    setCreateVideo(null);
    setCreatePos({ x, y });
    // The Add Defect dialog opens on the Choose Media Type step — never
    // straight into the camera. The user picks Photo or Video first.
    setCreateStep("media-type");
    setMediaType(null);
    // Auto-exit place mode; the Add Defect modal opens for this position.
    setMode("view");
  }

  // Closing the Add Defect dialog (Cancel / backdrop / after save) removes
  // the temporary pin and any captured-but-unsaved photos.
  function closeCreate() {
    setCreatePos(null);
    createPhotos.clearFiles();
    setCreateVideo(null);
    setCreateStep("media-type");
    setMediaType(null);
    setShowNote(false);
    setNote("");
    setCustomName("");
    setError(null);
  }

  // Step 1 → Step 2: remember the current selection so the auto-advance
  // effect below only fires on a NEW pick made from this step.
  function goToSource(type: "photo" | "video") {
    setError(null);
    setMediaType(type);
    sourceBaseline.current = {
      photos: createPhotos.items.length,
      video: createVideo,
    };
    setCreateStep("media-source");
  }

  // Advance to the defect form once media actually lands while on the source
  // step (the native camera/picker returns asynchronously, and a cancelled or
  // rejected pick must NOT advance).
  useEffect(() => {
    if (createStep !== "media-source") return;
    const base = sourceBaseline.current;
    if (
      createPhotos.items.length > base.photos ||
      (createVideo !== null && createVideo !== base.video)
    ) {
      setCreateStep("form");
    }
  }, [createStep, createPhotos.items.length, createVideo]);

  // Video pick for the NEW defect (board-owned inputs, mounted below so they
  // exist before the dialog's form step does). Validated here; invalid picks
  // keep the current selection and surface the error inside the dialog.
  function handleCreateVideoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const picked = input.files?.[0];
    // Reset so recording/choosing the same file again fires onChange again.
    input.value = "";
    if (!picked) return; // camera/picker cancelled — keep current selection
    const invalid = checkVideoFile(picked);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setCreateVideo(picked);
  }

  // Selecting a Defect Type preselects its default Sub-Con (still changeable).
  function handleTypeChange(newTypeId: string) {
    setTypeId(newTypeId);
    const t = defectTypes.find((dt) => dt.id === newTypeId);
    if (t?.defaultSubConId && subCons.some((s) => s.id === t.defaultSubConId)) {
      setAssigneeId(t.defaultSubConId);
    }
  }

  function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Duplicate-submit guard. The ref flips SYNCHRONOUSLY: useTransition's
    // `pending` only turns true on the next render, so two taps in the same
    // frame would both pass a pending-only check and create two defects.
    if (!createPos || pending || submittingRef.current) return;
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
    // Optional short video: validated up front, but uploaded only AFTER the
    // defect exists (the upload URL needs the new defectId).
    if (createVideo) {
      const vErr = checkVideoFile(createVideo);
      if (vErr) {
        setError(vErr);
        return;
      }
    }
    appendPhotos(fd, createPhotos.items);
    fd.set("projectId", projectId);
    fd.set("drawingId", drawing.id);
    fd.set("x", String(createPos.x));
    fd.set("y", String(createPos.y));
    setError(null);
    submittingRef.current = true;
    startTransition(async () => {
      const res = await createDefect(fd).finally(() => {
        submittingRef.current = false;
      });
      if (res.error) {
        // Keep the dialog (and pin + photo) so the user can fix and retry.
        setError(res.error);
      } else {
        // Deferred video upload, now that the defect id exists. The defect is
        // already saved: a video failure must not roll it back or reopen the
        // form — surface it as a toast and let the user retry from the
        // defect detail dialog. Upload never changes the defect status.
        if (createVideo && res.defectId) {
          try {
            const vfd = new FormData();
            vfd.set("video", createVideo);
            const up = await fetch(`/api/defects/${res.defectId}/videos`, {
              method: "POST",
              body: vfd,
            });
            if (!up.ok) {
              const data = (await up
                .json()
                .catch(() => ({}))) as { error?: string };
              toast.error(
                data.error ??
                  "Defect saved, but the video upload failed. Open the defect to try again.",
              );
            }
          } catch {
            toast.error(
              "Defect saved, but the video upload failed. Open the defect to try again.",
            );
          }
        }
        // Rapid continuous registration: close the form, confirm quietly,
        // stay on this unit layout (zoom/pan untouched — the viewer keeps its
        // client state through router.refresh()) and re-arm place mode so the
        // very next tap adds the next defect. Defect type + Sub-Con stay
        // selected for the next entry.
        closeCreate();
        setMode("place");
        toast.success("Defect added", { duration: 1500 });
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
      {/* Always-mounted hidden inputs for the Add Defect flow. Kept outside
          the dialog so they exist BEFORE the media-source step renders and can
          be clicked inside the user's tap (iOS only allows programmatic
          file-input clicks inside a gesture). Camera captures one photo per
          launch; each capture APPENDS to the list. Video keeps two SEPARATE
          inputs (camera w/ capture, gallery without) — on some mobile
          browsers `capture` forces the camera and blocks Gallery selection.
          Selecting media only updates state — never submits or navigates. */}
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
      <input
        ref={createGalleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const input = e.currentTarget;
          createPhotos.addFiles(input.files);
          input.value = "";
        }}
      />
      <input
        ref={createVideoCamRef}
        type="file"
        accept={VIDEO_ACCEPT}
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleCreateVideoPick}
      />
      <input
        ref={createVideoGalRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleCreateVideoPick}
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
          !isMaster && (
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
                Add Defect
              </Button>
            </>
          )
        }
      />
      <p className="text-sm text-muted-foreground max-md:hidden">
        {isMaster
          ? "This is the Master Layout. Pick a Unit/Floor Layout below to register defects."
          : mode === "place"
            ? "Tap the exact defect location. Press Escape or Add Defect again to cancel."
            : "Drag to pan, zoom for detail, tap a pin to open the defect. Use Add Defect to add a new one."}
      </p>

      {/* Quick Add Defect — compact form; bottom sheet on phones so the
          keyboard never hides the Submit button (the sheet scrolls). */}
      <Dialog
        open={createPos !== null}
        onOpenChange={(o) => !o && closeCreate()}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
          <DialogHeader>
            <DialogTitle>Add Defect</DialogTitle>
            {drawingLabel && (
              <DialogDescription>{drawingLabel}</DialogDescription>
            )}
          </DialogHeader>

          {/* Step 1 — Choose Media Type. No form fields yet; the pin position
              (createPos) is untouched by any step change. */}
          {createStep === "media-type" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Choose Media Type</p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-20 flex-1 flex-col gap-1.5"
                  onClick={() => goToSource("photo")}
                >
                  <ImageIcon className="size-6" />
                  Photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-20 flex-1 flex-col gap-1.5"
                  onClick={() => goToSource("video")}
                >
                  <Video className="size-6" />
                  Video
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {/* Reached via Change Media (media already selected): Back
                  returns to the form without losing anything. Fresh dialog:
                  Cancel closes it (existing behaviour, pin removed). */}
              {createPhotos.items.length > 0 || createVideo !== null ? (
                <button
                  type="button"
                  onClick={() => setCreateStep("form")}
                  className="flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeCreate}
                  className="flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          {/* Step 2 — Choose Media Source. Each button just clicks the
              matching board-mounted hidden input; the effect above moves to
              the form once a pick lands. Take Photo / Record Video are
              mobile-only (coarse pointer). */}
          {createStep === "media-source" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {mediaType === "photo" ? "Add Photo" : "Add Video"}
              </p>
              <div className="flex gap-3">
                {mediaType === "photo" ? (
                  <>
                    {isCoarse && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-20 flex-1 flex-col gap-1.5"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera className="size-6" />
                        Take Photo
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-20 flex-1 flex-col gap-1.5"
                      onClick={() => createGalleryRef.current?.click()}
                    >
                      <Images className="size-6" />
                      Choose Photos
                    </Button>
                  </>
                ) : (
                  <>
                    {isCoarse && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-20 flex-1 flex-col gap-1.5"
                        onClick={() => createVideoCamRef.current?.click()}
                      >
                        <Video className="size-6" />
                        Record Video
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-20 flex-1 flex-col gap-1.5"
                      onClick={() => createVideoGalRef.current?.click()}
                    >
                      <FilePlus2 className="size-6" />
                      Choose Video
                    </Button>
                  </>
                )}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setCreateStep("media-type");
                }}
                className="flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            </div>
          )}

          {/* Step 3 — the existing defect form. */}
          {createStep === "form" && (
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="defectTypeId">Defect *</Label>
              <select
                id="defectTypeId"
                name="defectTypeId"
                required
                value={typeId}
                onChange={(e) => handleTypeChange(e.target.value)}
                className={selectClass}
              >
                <option value="" disabled>
                  Select defect…
                </option>
                {defectTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedType?.isOthers && (
              <div className="space-y-2">
                <Label htmlFor="customName">Defect Name *</Label>
                <Input
                  id="customName"
                  name="customName"
                  required
                  maxLength={80}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Short defect name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="assignedToId">Assigned Sub-Con / Trade</Label>
              <select
                id="assignedToId"
                name="assignedToId"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={selectClass}
              >
                <option value="">Others / Unassigned</option>
                {subCons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {/* Selected media preview. Photos keep the existing multi-photo
                UI (thumbnails, remove, append more); a selected video shows
                its filename chip. Media was picked in steps 1–2 — the
                board-mounted hidden inputs feed the same state. */}
            {(mediaType === "photo" || createPhotos.items.length > 0) && (
              <MultiPhotoInput
                items={createPhotos.items}
                onAddFiles={createPhotos.addFiles}
                onRemove={createPhotos.removeFile}
                cameraInputRef={cameraInputRef}
              />
            )}
            {(mediaType === "video" || createVideo !== null) && (
              <VideoPicker
                chipOnly
                file={createVideo}
                onSelect={setCreateVideo}
                onRemove={() => setCreateVideo(null)}
                disabled={pending}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCreateStep("media-type");
              }}
              className="flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              Change Media
            </button>
            <button
              type="button"
              onClick={() => setShowNote((v) => !v)}
              className="flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {showNote ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Add note
            </button>
            {showNote && (
              <Textarea
                id="description"
                name="description"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Description / note (optional)"
              />
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="submit"
                disabled={pending}
                className="w-full max-sm:h-12 sm:w-auto"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Defect
              </Button>
            </DialogFooter>
          </form>
          )}
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
                      videoActions={{
                        recordVideo: () => detailVideoCamRef.current?.click(),
                        chooseVideo: () => detailVideoGalRef.current?.click(),
                      }}
                      videoSlot={
                        <ShortVideoInput
                          defectId={selected.id}
                          externalTriggers={{
                            cameraRef: detailVideoCamRef,
                            galleryRef: detailVideoGalRef,
                          }}
                        />
                      }
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
