"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import Image from "next/image";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  checkImageFile,
  MAX_FILES_PER_UPLOAD,
  MAX_TOTAL_UPLOAD_BYTES,
  TOO_MANY_FILES_ERROR,
  TOTAL_TOO_LARGE_ERROR,
} from "@/lib/upload-limits";

/**
 * Multi-photo selection shared by every photo upload flow:
 * - Mobile camera captures one photo per launch; each capture APPENDS.
 * - Gallery picker allows selecting several files at once (`multiple`).
 * - Previews are local object URLs (revoked on remove/clear/unmount) — never
 *   the final /uploads URL, which only exists after the server saves.
 * - Selecting files only updates local state; nothing submits or navigates.
 *   The parent appends the files to FormData ("photos") on explicit save.
 */

export type PhotoItem = { id: string; file: File; url: string };

// crypto.randomUUID exists only in secure contexts (HTTPS / localhost), so it
// throws on iPhone Safari over plain-HTTP LAN dev URLs. Prefer it when
// available, then getRandomValues, then a time + counter + Math.random string.
let photoIdCounter = 0;
function newPhotoId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  if (typeof c?.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  photoIdCounter += 1;
  return `photo-${Date.now().toString(36)}-${photoIdCounter}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// Coarse pointer (touch) capability — capability detection, NOT user-agent
// sniffing. Server snapshot is false so desktop-style markup hydrates cleanly.
function subscribeCoarsePointer(onChange: () => void) {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
export function useCoarsePointer() {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

/**
 * Holds the selected photo list. `onError` receives a message when files are
 * rejected (type/size/limit), or null when a selection is accepted cleanly.
 */
export function usePhotoFiles({
  maxFiles = MAX_FILES_PER_UPLOAD,
  onError,
}: {
  maxFiles?: number;
  onError: (message: string | null) => void;
}) {
  const [items, setItems] = useState<PhotoItem[]>([]);

  // Track live items so unmount cleanup revokes exactly the current URLs.
  const itemsRef = useRef<PhotoItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => {
      for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
    },
    [],
  );

  const addFiles = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const incoming = Array.from(list ?? []);
      if (incoming.length === 0) return; // camera cancelled — keep current list
      // Reject invalid files up front (server re-validates authoritatively).
      const invalid = incoming.map(checkImageFile).find((e) => e !== null);
      const valid = incoming.filter((f) => checkImageFile(f) === null);
      const current = itemsRef.current;
      const room = Math.max(0, maxFiles - current.length);
      const withinCount = valid.slice(0, room);
      // Whole-submission budget: stop accepting once the running total
      // (existing selection + new files) would exceed 25MB.
      let total = current.reduce((sum, it) => sum + it.file.size, 0);
      const accepted: File[] = [];
      let totalExceeded = false;
      for (const f of withinCount) {
        if (total + f.size > MAX_TOTAL_UPLOAD_BYTES) {
          totalExceeded = true;
          break;
        }
        total += f.size;
        accepted.push(f);
      }
      if (invalid) onError(invalid);
      else if (valid.length > room) onError(TOO_MANY_FILES_ERROR);
      else if (totalExceeded) onError(TOTAL_TOO_LARGE_ERROR);
      else onError(null);
      if (accepted.length === 0) return;
      setItems((prev) => [
        ...prev,
        ...accepted.map((file) => ({
          id: newPhotoId(),
          file,
          url: URL.createObjectURL(file),
        })),
      ]);
    },
    [maxFiles, onError],
  );

  const removeFile = useCallback((id: string) => {
    setItems((prev) => {
      const gone = prev.find((it) => it.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setItems((prev) => {
      for (const it of prev) URL.revokeObjectURL(it.url);
      return [];
    });
  }, []);

  return { items, addFiles, removeFile, clearFiles };
}

/** Append the selected files to a FormData under the "photos" field. */
export function appendPhotos(fd: FormData, items: PhotoItem[]) {
  for (const it of items) fd.append("photos", it.file);
}

export function MultiPhotoInput({
  items,
  onAddFiles,
  onRemove,
  maxFiles = MAX_FILES_PER_UPLOAD,
  cameraInputRef,
  className,
}: {
  items: PhotoItem[];
  onAddFiles: (list: FileList | null) => void;
  onRemove: (id: string) => void;
  maxFiles?: number;
  /**
   * Optional externally-mounted camera input (must be rendered by the parent
   * with capture="environment" and wired to onAddFiles). Used by the Add
   * Defect camera-first flow, where the camera input must exist BEFORE this
   * dialog mounts so it can be clicked in the pin-placement tap. When omitted,
   * an internal camera input is rendered.
   */
  cameraInputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const isCoarse = useCoarsePointer();
  const internalCameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = cameraInputRef ?? internalCameraRef;
  const full = items.length >= maxFiles;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    onAddFiles(input.files);
    // Reset so re-taking / re-choosing the same file fires onChange again.
    input.value = "";
  }

  return (
    <div className={cn("space-y-2", className)}>
      {items.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((it, i) => (
              <div
                key={it.id}
                className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <Image
                  src={it.url}
                  alt={`Photo ${i + 1} preview`}
                  fill
                  unoptimized
                  className="object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => onRemove(it.id)}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {items.length} photo{items.length > 1 ? "s" : ""} selected
            {full ? ` (max ${maxFiles})` : ""}
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {isCoarse && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-11 max-md:px-3"
            disabled={full}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            {items.length > 0 ? "Take Another Photo" : "Take Photo"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-11 max-md:px-3"
          disabled={full}
          onClick={() => galleryRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          {items.length > 0 ? "Choose More Photos" : "Choose Photos"}
        </Button>
      </div>

      {/* Hidden inputs. No `name`: files travel via FormData.append("photos")
          on explicit save only. Camera captures one photo per launch (no
          `multiple` needed); the gallery picker allows several at once. */}
      {!cameraInputRef && (
        <input
          ref={internalCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleChange}
        />
      )}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />
    </div>
  );
}
