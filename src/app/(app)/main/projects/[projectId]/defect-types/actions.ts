"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/enums";

export type DefectTypeActionState = { error?: string };

const MAX_NAME_LENGTH = 60;

function typesPath(projectId: string) {
  return `/main/projects/${projectId}/defect-types`;
}

/** Ownership guard: the project must belong to the logged-in Main-Con. */
async function findOwnedProject(projectId: string, ownerId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true },
  });
}

/** Ownership guard for one Defect Type row (via its project's owner). */
async function findOwnedDefectType(defectTypeId: string, ownerId: string) {
  return prisma.defectType.findFirst({
    where: { id: defectTypeId, project: { ownerId } },
  });
}

/** A default Sub-Con must be an ACTIVE Sub-Con owned by this Main-Con. */
async function validDefaultSubConId(
  raw: FormDataEntryValue | null,
  mainConId: string,
): Promise<{ id: string | null; error?: string }> {
  const id = String(raw ?? "") || null;
  if (!id) return { id: null };
  const subCon = await prisma.user.findFirst({
    where: { id, role: Role.SUB_CON, mainConId, active: true },
    select: { id: true },
  });
  if (!subCon) return { id: null, error: "Invalid default Sub-Con selected." };
  return { id };
}

export async function createDefectType(
  formData: FormData,
): Promise<DefectTypeActionState> {
  const user = await requireRole("MAIN_CON");

  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: "Defect name is required." };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Defect name must be ${MAX_NAME_LENGTH} characters or less.` };
  }

  const project = await findOwnedProject(projectId, user.userId);
  if (!project) return { error: "Project not found." };

  const subCon = await validDefaultSubConId(
    formData.get("defaultSubConId"),
    user.userId,
  );
  if (subCon.error) return { error: subCon.error };

  const existing = await prisma.defectType.findFirst({
    where: { projectId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { error: "This defect name already exists." };

  // New types slot in just before "Others" so Others stays last in dropdowns.
  const others = await prisma.defectType.findFirst({
    where: { projectId, isOthers: true },
    select: { id: true, sortOrder: true },
  });
  const last = await prisma.defectType.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });
  const sortOrder = others ? others.sortOrder : (last._max.sortOrder ?? -1) + 1;

  await prisma.$transaction([
    ...(others
      ? [
          prisma.defectType.update({
            where: { id: others.id },
            data: { sortOrder: others.sortOrder + 1 },
          }),
        ]
      : []),
    prisma.defectType.create({
      data: {
        name,
        sortOrder,
        projectId,
        defaultSubConId: subCon.id,
      },
    }),
  ]);

  revalidatePath(typesPath(projectId));
  return {};
}

export async function updateDefectType(
  formData: FormData,
): Promise<DefectTypeActionState> {
  const user = await requireRole("MAIN_CON");

  const defectTypeId = String(formData.get("defectTypeId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const target = await findOwnedDefectType(defectTypeId, user.userId);
  if (!target) return { error: "Defect Type not found." };

  // The "Others" row keeps its name (its input is disabled and not submitted),
  // but its default Sub-Con is still editable.
  if (!target.isOthers) {
    if (!name) return { error: "Defect name is required." };
    if (name.length > MAX_NAME_LENGTH) {
      return { error: `Defect name must be ${MAX_NAME_LENGTH} characters or less.` };
    }
  }

  const subCon = await validDefaultSubConId(
    formData.get("defaultSubConId"),
    user.userId,
  );
  if (subCon.error) return { error: subCon.error };

  if (!target.isOthers && name.toLowerCase() !== target.name.toLowerCase()) {
    const existing = await prisma.defectType.findFirst({
      where: {
        projectId: target.projectId,
        name: { equals: name, mode: "insensitive" },
        NOT: { id: target.id },
      },
      select: { id: true },
    });
    if (existing) return { error: "This defect name already exists." };
  }

  await prisma.defectType.update({
    where: { id: target.id },
    data: {
      // The "Others" row keeps its name so the custom-name flow stays intact.
      name: target.isOthers ? target.name : name,
      defaultSubConId: subCon.id,
    },
  });

  revalidatePath(typesPath(target.projectId));
  return {};
}

export async function setDefectTypeActive(input: {
  defectTypeId: string;
  active: boolean;
}): Promise<DefectTypeActionState> {
  const user = await requireRole("MAIN_CON");

  const target = await findOwnedDefectType(input.defectTypeId, user.userId);
  if (!target) return { error: "Defect Type not found." };
  // "Others" must always be selectable — it is the fallback for unmatched
  // legacy defects and unregistered defect names.
  if (target.isOthers && !input.active) {
    return { error: "The Others type cannot be deactivated." };
  }

  await prisma.defectType.update({
    where: { id: target.id },
    data: { active: input.active },
  });

  revalidatePath(typesPath(target.projectId));
  return {};
}

export async function moveDefectType(input: {
  defectTypeId: string;
  direction: "up" | "down";
}): Promise<DefectTypeActionState> {
  const user = await requireRole("MAIN_CON");

  const target = await findOwnedDefectType(input.defectTypeId, user.userId);
  if (!target) return { error: "Defect Type not found." };

  // Neighbor in display order (sortOrder, then createdAt as tiebreaker is
  // unnecessary here — orders are kept unique by swapping).
  const neighbor = await prisma.defectType.findFirst({
    where: {
      projectId: target.projectId,
      sortOrder:
        input.direction === "up"
          ? { lt: target.sortOrder }
          : { gt: target.sortOrder },
    },
    orderBy: { sortOrder: input.direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return {}; // already first / last — nothing to do

  await prisma.$transaction([
    prisma.defectType.update({
      where: { id: target.id },
      data: { sortOrder: neighbor.sortOrder },
    }),
    prisma.defectType.update({
      where: { id: neighbor.id },
      data: { sortOrder: target.sortOrder },
    }),
  ]);

  revalidatePath(typesPath(target.projectId));
  return {};
}
