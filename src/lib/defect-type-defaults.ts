// Default project-scoped Defect Type list, created for every new project and
// backfilled into existing ones (scripts/backfill-defect-types.ts). Plain data
// module (no "server-only") so tsx scripts can import it too.

export const OTHERS_TYPE_NAME = "Others";

/** Ordered default list; "Others" always sits last and is the isOthers row. */
export const DEFAULT_DEFECT_TYPE_NAMES = [
  "Crack",
  "Water Leakage",
  "Hollow Tile",
  "Tile Damage",
  "Paint Defect",
  "Door Defect",
  "Window Defect",
  "Electrical Defect",
  "Plumbing Defect",
  OTHERS_TYPE_NAME,
] as const;

/** Rows for a nested `defectTypes: { create: ... }` on project creation. */
export function defaultDefectTypeSeed() {
  return DEFAULT_DEFECT_TYPE_NAMES.map((name, i) => ({
    name,
    sortOrder: i,
    isOthers: name === OTHERS_TYPE_NAME,
  }));
}

/** Rows ready for prisma createMany under one project. */
export function defaultDefectTypeRows(projectId: string) {
  return defaultDefectTypeSeed().map((row) => ({ ...row, projectId }));
}
