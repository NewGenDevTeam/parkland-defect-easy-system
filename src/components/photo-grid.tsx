import Image from "next/image";

export type GridPhoto = { id: string; url: string };

/**
 * Simple responsive thumbnail grid. Each thumbnail links to the full image in
 * a new tab. Safe to use in both server and client components (no hooks).
 */
export function PhotoGrid({ photos }: { photos: GridPhoto[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p) => (
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
  );
}
