/**
 * One-time backfill for the Defect Type feature:
 * 1. Every existing project gets the default Defect Type list (rows that are
 *    missing are added; existing rows are never touched).
 * 2. Every defect without a defectTypeId is linked to the type whose name
 *    matches its title (case-insensitive). No match -> linked to "Others",
 *    keeping the original title as the custom defect name.
 *
 * Additive only — never deletes or rewrites titles.
 *
 * Usage:
 *   npx tsx scripts/backfill-defect-types.ts        # dry run (report only)
 *   npx tsx scripts/backfill-defect-types.ts --fix  # apply the updates
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  defaultDefectTypeRows,
  OTHERS_TYPE_NAME,
} from "../src/lib/defect-type-defaults";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const FIX = process.argv.includes("--fix");

async function main() {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true },
  });
  console.log(`Scanning ${projects.length} project(s) (${FIX ? "FIX" : "dry run"})`);

  let typesCreated = 0;
  let defectsLinked = 0;
  let defectsToOthers = 0;

  for (const project of projects) {
    const existing = await prisma.defectType.findMany({
      where: { projectId: project.id },
      select: { id: true, name: true, isOthers: true },
    });
    const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));
    const missing = defaultDefectTypeRows(project.id).filter(
      (row) => !existingNames.has(row.name.toLowerCase()),
    );
    if (missing.length > 0) {
      console.log(
        `Project "${project.name}": adding ${missing.length} default type(s): ${missing
          .map((m) => m.name)
          .join(", ")}`,
      );
      if (FIX) await prisma.defectType.createMany({ data: missing });
      typesCreated += missing.length;
    }

    const types = FIX
      ? await prisma.defectType.findMany({
          where: { projectId: project.id },
          select: { id: true, name: true, isOthers: true },
        })
      : existing;
    const byName = new Map(types.map((t) => [t.name.toLowerCase(), t.id]));
    const othersId =
      types.find((t) => t.isOthers)?.id ??
      byName.get(OTHERS_TYPE_NAME.toLowerCase()) ??
      null;

    const defects = await prisma.defect.findMany({
      where: { projectId: project.id, defectTypeId: null },
      select: { id: true, title: true },
    });
    for (const d of defects) {
      const matched = byName.get(d.title.trim().toLowerCase()) ?? null;
      const target = matched ?? othersId;
      if (!target) {
        // Dry run before types exist: report what WOULD happen.
        console.log(`  Defect "${d.title}" -> Others (created on --fix)`);
        defectsToOthers++;
        continue;
      }
      if (FIX) {
        await prisma.defect.update({
          where: { id: d.id },
          data: { defectTypeId: target },
        });
      }
      if (matched) {
        defectsLinked++;
      } else {
        console.log(`  Defect "${d.title}" -> Others (title kept as custom name)`);
        defectsToOthers++;
      }
    }
  }

  console.log(
    `Done. Types created: ${typesCreated}, defects matched to a type: ${defectsLinked}, defects linked to Others: ${defectsToOthers}${
      FIX ? " (applied)" : " (dry run — rerun with --fix to apply)"
    }`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
