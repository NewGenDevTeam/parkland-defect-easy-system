/**
 * One-time repair: normalize Drawing.imageUrl / Photo.url values to the web
 * form `/uploads/<filename>` (forward slashes, no filesystem prefixes).
 *
 * Usage:
 *   npx tsx scripts/normalize-upload-urls.ts        # dry run (report only)
 *   npx tsx scripts/normalize-upload-urls.ts --fix  # apply the updates
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const FIX = process.argv.includes("--fix");
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const VALID = /^\/uploads\/[A-Za-z0-9._-]+$/;

/** Try to recover `/uploads/<filename>` from any malformed stored value. */
function normalize(url: string): string | null {
  if (VALID.test(url)) return null; // already correct
  // Unify separators, then take the last path segment as the filename.
  const cleaned = url.replace(/\\/g, "/");
  const filename = cleaned.split("/").filter(Boolean).pop() ?? "";
  if (!/^[A-Za-z0-9._-]+\.[A-Za-z0-9]+$/.test(filename)) return null;
  return `/uploads/${filename}`;
}

async function main() {
  let drawingUpdates = 0;
  let photoUpdates = 0;
  let invalid = 0;

  const drawings = await prisma.drawing.findMany({
    select: { id: true, imageUrl: true },
  });
  const photos = await prisma.photo.findMany({ select: { id: true, url: true } });

  console.log(`Scanning ${drawings.length} Drawing + ${photos.length} Photo records (${FIX ? "FIX" : "dry run"})`);

  for (const d of drawings) {
    const fixed = normalize(d.imageUrl);
    const current = fixed ?? d.imageUrl;
    const fileExists = existsSync(path.join(UPLOADS_DIR, path.posix.basename(current)));
    if (fixed) {
      console.log(`Drawing ${d.id}: "${d.imageUrl}" -> "${fixed}" (file exists: ${fileExists})`);
      if (FIX) {
        await prisma.drawing.update({ where: { id: d.id }, data: { imageUrl: fixed } });
      }
      drawingUpdates++;
    } else if (!VALID.test(d.imageUrl)) {
      console.log(`Drawing ${d.id}: UNRECOVERABLE "${d.imageUrl}"`);
      invalid++;
    } else if (!fileExists) {
      console.log(`Drawing ${d.id}: url ok but file missing: ${d.imageUrl}`);
    }
  }

  for (const p of photos) {
    const fixed = normalize(p.url);
    const current = fixed ?? p.url;
    const fileExists = existsSync(path.join(UPLOADS_DIR, path.posix.basename(current)));
    if (fixed) {
      console.log(`Photo ${p.id}: "${p.url}" -> "${fixed}" (file exists: ${fileExists})`);
      if (FIX) {
        await prisma.photo.update({ where: { id: p.id }, data: { url: fixed } });
      }
      photoUpdates++;
    } else if (!VALID.test(p.url)) {
      console.log(`Photo ${p.id}: UNRECOVERABLE "${p.url}"`);
      invalid++;
    } else if (!fileExists) {
      console.log(`Photo ${p.id}: url ok but file missing: ${p.url}`);
    }
  }

  console.log(
    `Done. Drawings needing update: ${drawingUpdates}, Photos needing update: ${photoUpdates}, unrecoverable: ${invalid}${FIX ? " (updates applied)" : " (dry run — rerun with --fix to apply)"}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
