"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  saveUploadedImage,
  saveUploadedImages,
  deleteUploadedImage,
  deleteUploadedImages,
} from "@/lib/upload";
import { NO_FILES_ERROR } from "@/lib/upload-limits";
import { defaultDefectTypeSeed } from "@/lib/defect-type-defaults";
import {
  Priority,
  DefectStatus,
  ProjectStatus,
  PhotoType,
  Role,
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
  // The default Defect Type list is seeded in the same write so the Quick Add
  // dropdown is never empty on a fresh project.
  const project = await prisma.project.create({
    data: {
      name,
      location: location || null,
      description: description || null,
      status: ProjectStatus.ACTIVE,
      ownerId: user.userId,
      defectTypes: { create: defaultDefectTypeSeed() },
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
  const user = await requireRole("MAIN_CON");

  const projectId = String(formData.get("projectId") ?? "");
  // Layout name (e.g. "A-11") shown in the unit selector; falls back to the
  // uploaded file name. isMaster marks the project's single overview plan.
  const name = String(formData.get("name") ?? "").trim();
  const isMaster = formData.get("isMaster") === "on";

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.userId },
  });
  if (!project) return { error: "Project not found." };

  const saved = await saveUploadedImage(formData.get("file"));
  if (saved.error) return { error: saved.error };

  try {
    // One optional Master Layout per project: marking a new one demotes any
    // previous master to a regular unit layout (its defects are untouched).
    await prisma.$transaction([
      ...(isMaster
        ? [
            prisma.drawing.updateMany({
              where: { projectId, isMaster: true },
              data: { isMaster: false },
            }),
          ]
        : []),
      prisma.drawing.create({
        data: {
          name: name || (formData.get("file") as File).name,
          imageUrl: saved.url!,
          isMaster,
          projectId,
        },
      }),
    ]);
  } catch {
    // DB write failed after the file hit disk — remove the orphan file.
    await deleteUploadedImage(saved.url!);
    return { error: "Could not save the floor plan. Please try again." };
  }

  revalidatePath(`/main/projects/${projectId}`);
  return {};
}

// --- Defects --------------------------------------------------------------

// Takes FormData (not a plain object) so the optional defect photo file can
// travel in the same request as the defect fields.
export async function createDefect(
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireRole("MAIN_CON");

  const projectId = String(formData.get("projectId") ?? "");
  const drawingId = String(formData.get("drawingId") ?? "");
  const x = Number(formData.get("x"));
  const y = Number(formData.get("y"));
  const defectTypeId = String(formData.get("defectTypeId") ?? "");
  const customName = String(formData.get("customName") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  // Optional; the Quick Add form omits it and defaults to MEDIUM.
  const priority = String(formData.get("priority") ?? "") || Priority.MEDIUM;
  const assignedToId = String(formData.get("assignedToId") ?? "") || null;

  if (!defectTypeId) return { error: "Please select a defect." };
  if (!(priority in Priority)) return { error: "Invalid priority." };
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    return { error: "Invalid pin position." };
  }

  // Ownership: the defect must land on a drawing of a project this Main-Con owns.
  const drawing = await prisma.drawing.findFirst({
    where: { id: drawingId, projectId, project: { ownerId: user.userId } },
  });
  if (!drawing) return { error: "Upload a floor plan before adding defects." };

  // The defect type must be an ACTIVE type of this project. "Others" requires
  // a short custom defect name; regular types use their own name as the title.
  const defectType = await prisma.defectType.findFirst({
    where: { id: defectTypeId, projectId, active: true },
    select: { id: true, name: true, isOthers: true },
  });
  if (!defectType) return { error: "Please select a valid defect." };
  if (defectType.isOthers && !customName) {
    return { error: "Please enter a short defect name for Others." };
  }
  if (customName.length > 80) {
    return { error: "Custom defect name must be 80 characters or less." };
  }
  const title = defectType.isOthers ? customName : defectType.name;

  // New assignments must go to an ACTIVE Sub-Con owned by this Main-Con.
  // The Sub-Con's department doubles as the stored trade label.
  let trade: string | null = null;
  if (assignedToId) {
    const subCon = await prisma.user.findFirst({
      where: {
        id: assignedToId,
        role: Role.SUB_CON,
        mainConId: user.userId,
        active: true,
      },
      select: { id: true, department: true },
    });
    if (!subCon) return { error: "Invalid Sub-Con selected." };
    trade = subCon.department;
  }

  // Optional defect photos (up to 5): ALL are validated before ANY is saved,
  // so an invalid file never produces a partial defect. Zero photos is fine.
  const saved = await saveUploadedImages(formData.getAll("photos"));
  if (saved.error) return { error: saved.error };
  const photoUrls = saved.urls!;

  // Nested create keeps defect + photos in a single atomic write: either all
  // rows exist afterwards or none do.
  try {
    await prisma.defect.create({
      data: {
        title,
        description: description || null,
        trade,
        defectTypeId: defectType.id,
        priority: priority as Priority,
        status: assignedToId ? DefectStatus.ASSIGNED : DefectStatus.NEW,
        x,
        y,
        projectId,
        drawingId,
        createdById: user.userId,
        assignedToId,
        ...(photoUrls.length > 0
          ? {
              photos: {
                create: photoUrls.map((url) => ({
                  url,
                  type: PhotoType.DEFECT,
                })),
              },
            }
          : {}),
      },
    });
  } catch {
    // DB write failed after the photos hit disk — remove the orphan files.
    await deleteUploadedImages(photoUrls);
    return { error: "Could not create the defect. Please try again." };
  }

  revalidatePath(`/main/projects/${projectId}`);
  return {};
}

export async function updateDefect(input: {
  defectId: string;
  projectId: string;
  assignedToId?: string;
  status: string;
}): Promise<{ error?: string }> {
  const user = await requireRole("MAIN_CON");

  if (!(input.status in DefectStatus)) return { error: "Invalid status." };

  const defect = await prisma.defect.findFirst({
    where: { id: input.defectId, project: { ownerId: user.userId } },
    select: { id: true, assignedToId: true },
  });
  if (!defect) return { error: "Defect not found." };

  const assignedToId = input.assignedToId || null;

  // Keeping the current assignee (even if deactivated) is always allowed;
  // a NEW assignee must be an ACTIVE Sub-Con owned by this Main-Con.
  if (assignedToId && assignedToId !== defect.assignedToId) {
    const subCon = await prisma.user.findFirst({
      where: {
        id: assignedToId,
        role: Role.SUB_CON,
        mainConId: user.userId,
        active: true,
      },
      select: { id: true },
    });
    if (!subCon) return { error: "Invalid Sub-Con selected." };
  }

  await prisma.defect.update({
    where: { id: defect.id },
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
 * Upload additional DEFECT reference photos (up to 5 per save) for a defect
 * the main-con owns. Existing photos are never touched. Images are saved to
 * the local runtime uploads folder (dev/demo only — see src/lib/upload.ts).
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

  const saved = await saveUploadedImages(formData.getAll("photos"));
  if (saved.error) return { error: saved.error };
  if (saved.urls!.length === 0) return { error: NO_FILES_ERROR };

  try {
    // createMany: one statement, so it's all-or-nothing in the database.
    await prisma.photo.createMany({
      data: saved.urls!.map((url) => ({
        url,
        type: PhotoType.DEFECT,
        defectId,
      })),
    });
  } catch {
    // DB write failed after the files hit disk — remove the orphan files.
    await deleteUploadedImages(saved.urls!);
    return { error: "Could not save the photos. Please try again." };
  }

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
