import Image from "next/image";
import { formatMalaysiaDateTime } from "@/lib/format-date";

export type GridPhoto = {
  id: string;
  url: string;
  /** IMAGE (default) or VIDEO — decides thumbnail vs player rendering. */
  media?: "IMAGE" | "VIDEO";
  /** ISO upload timestamp, shown under video evidence. */
  createdAt?: string;
};

/**
 * Defect evidence display. Images render as the familiar thumbnail grid
 * (each linking to the full file); short videos render below as responsive
 * inline players — never as a broken <Image> thumbnail. Safe to use in both
 * server and client components (no hooks).
 */
export function PhotoGrid({ photos }: { photos: GridPhoto[] }) {
  const images = photos.filter((p) => p.media !== "VIDEO");
  const videos = photos.filter((p) => p.media === "VIDEO");

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="relative aspect-square overflow-hidden rounded-lg border bg-muted transition-opacity hover:opacity-90"
            >
              <Image src={p.url} alt="Defect photo" fill unoptimized className="object-cover" />
            </a>
          ))}
        </div>
      )}
      {videos.map((v) => (
        <div key={v.id} className="space-y-1">
          {/* preload="metadata": only the header/first frame loads until the
              user presses play. No autoplay. */}
          <video
            controls
            preload="metadata"
            playsInline
            src={v.url}
            className="max-h-72 w-full rounded-lg border bg-black"
          />
          {v.createdAt && (
            <p className="text-xs text-muted-foreground">
              Video · {formatMalaysiaDateTime(v.createdAt)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
