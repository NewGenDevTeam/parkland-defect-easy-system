"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { saveUploadedImage } from "@/lib/upload";
import {
  Priority,
  DefectStatus,
  ProjectStatus,
  PhotoType,
} from "@/generated/prisma/enums";

// --- Projects -------------------------------------------------------------

export type ProjectFormState = { error?: string };

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireRole("MAIN_CON");

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) return { error: "Project name is required." };

  // New projects always start as ACTIVE. Status can be changed later; there is
  // no reason to create a project that is already Completed.
  const project = await prisma.project.create({
    data: {
      name,
      location: location || null,
      description: description || null,
      status: ProjectStatus.ACTIVE,
      ownerId: user.userId,
    },
  });

  revalidatePath("/main/projects");
  redirect(`/main/projects/${project.id}`);
}

// --- Drawing / floor plan upload -----------------------------------------

// See src/lib/upload.ts — uploaded images are stored in local `public/uploads`
// for dev/demo only. Swap for Cloudflare R2 / Amazon S3 in production.
export async function uploadDrawing(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  await requireRole("MAIN_CON");

  const projectId = String(formData.get("projectId") ?? "");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found." };

  const saved = await saveUploadedImage(formData.get("file"));
  if (saved.error) return { error: saved.error };

  await prisma.drawing.create({
    data: {
      name: (formData.get("file") as File).name,
      imageUrl: saved.url!,
      projectId,
    },
  });

  revalidatePath(`/main/projects/${projectId}`);
  return {};
}

// --- Defects --------------------------------------------------------------

type CreateDefectInput = {
  projectId: string;
  drawingId: string;
  x: number;
  y: number;
  title: string;
  description?: string;
  trade: string;
  priority: string;
  assignedToId?: string;
};

export async function createDefect(
  input: CreateDefectInput,
): Promise<{ error?: string }> {
  const user = await requireRole("MAIN_CON");

  const title = input.title?.trim();
  const trade = input.trade?.trim();
  if (!title) return { error: "Title is required." };
  if (!trade) return { error: "Category / trade is required." };
  if (!(input.priority in Priority)) return { error: "Invalid priority." };
  if (
    typeof input.x !== "number" ||
    typeof input.y !== "number" ||
    input.x < 0 ||
    input.x > 1 ||
    input.y < 0 ||
    input.y > 1
  ) {
    return { error: "Invalid pin position." };
  }

  const drawing = await prisma.drawing.findFirst({
    where: { id: input.drawingId, projectId: input.projectId },
  });
  if (!drawing) return { error: "Upload a floor plan before adding defects." };

  const assignedToId = input.assignedToId || null;

  await prisma.defect.create({
    data: {
      title,
      description: input.description?.trim() || null,
      trade,
      priority: input.priority as Priority,
      status: assignedToId ? DefectStatus.ASSIGNED : DefectStatus.NEW,
      x: input.x,
      y: input.y,
      projectId: input.projectId,
      drawingId: input.drawingId,
      createdById: user.userId,
      assignedToId,
    },
  });

  revalidatePath(`/main/projects/${input.projectId}`);
  return {};
}

export async function updateDefect(input: {
  defectId: string;
  projectId: string;
  assignedToId?: string;
  status: string;
}): Promise<{ error?: string }> {
  await requireRole("MAIN_CON");

  if (!(input.status in DefectStatus)) return { error: "Invalid status." };

  const assignedToId = input.assignedToId || null;

  await prisma.defect.update({
    where: { id: input.defectId },
    data: {
      assignedToId,
      status: input.status as DefectStatus,
    },
  });

  revalidatePath(`/main/projects/${input.projectId}`);
  return {};
}

// --- Defect reference photos (MAIN_CON) -----------------------------------

/**
 * Upload a DEFECT reference photo for a defect the main-con owns.
 * Image is saved to local public/uploads (dev/demo only — see src/lib/upload.ts).
 */
export async function uploadDefectPhoto(
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireRole("MAIN_CON");

  const defectId = String(formData.get("defectId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  const defect = await prisma.defect.findFirst({
    where: { id: defectId, project: { ownerId: user.userId } },
    select: { id: true },
  });
  if (!defect) return { error: "Defect not found." };

  const saved = await saveUploadedImage(formData.get("file"));
  if (saved.error) return { error: saved.error };

  await prisma.photo.create({
    data: { url: saved.url!, type: PhotoType.DEFECT, defectId },
  });

  revalidatePath(`/main/projects/${projectId}`);
  return {};
}

// --- Review workflow (MAIN_CON) -------------------------------------------

/**
 * Main-con reviews a COMPLETED defect: close it, or reopen it (with an optional
 * short reason) so the sub-con works on it again.
 */
export async function reviewDefect(input: {
  defectId: string;
  projectId: string;
  action: "CLOSE" | "REOPEN";
  reopenReason?: string;
}): Promise<{ error?: string }> {
  const user = await requireRole("MAIN_CON");

  const defect = await prisma.defect.findFirst({
    where: { id: input.defectId, project: { ownerId: user.userId } },
    select: { id: true, status: true },
  });
  if (!defect) return { error: "Defect not found." };
  if (defect.status !== DefectStatus.COMPLETED) {
    return { error: "Only completed defects can be reviewed." };
  }

  if (input.action === "CLOSE") {
    await prisma.defect.update({
      where: { id: defect.id },
      data: { status: DefectStatus.CLOSED, reopenReason: null },
    });
  } else {
    await prisma.defect.update({
      where: { id: defect.id },
      data: {
        status: DefectStatus.REOPENED,
        reopenReason: input.reopenReason?.trim() || null,
      },
    });
  }

  revalidatePath(`/main/projects/${input.projectId}`);
  return {};
}
