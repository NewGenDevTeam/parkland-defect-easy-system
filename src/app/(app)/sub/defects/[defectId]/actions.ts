"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { saveUploadedImages, deleteUploadedImages } from "@/lib/upload";
import { NO_FILES_ERROR } from "@/lib/upload-limits";
import { DefectStatus, PhotoType } from "@/generated/prisma/enums";

// A sub-con can only ever touch defects assigned to them. Every action below
// re-checks that ownership before doing anything.
async function findAssignedDefect(defectId: string, userId: string) {
  return prisma.defect.findFirst({
    where: { id: defectId, assignedToId: userId },
    include: { photos: { where: { type: PhotoType.COMPLETION } } },
  });
}

/**
 * Upload COMPLETION photos (proof of fix, up to 5 per upload). Supports
 * mobile camera capture on the client. All files are validated before any is
 * saved. Images are saved to the local runtime uploads folder (dev/demo only
 * — see src/lib/upload.ts).
 */
export async function uploadCompletionPhoto(
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireRole("SUB_CON");

  const defectId = String(formData.get("defectId") ?? "");
  const defect = await findAssignedDefect(defectId, user.userId);
  if (!defect) return { error: "Defect not found." };

  const saved = await saveUploadedImages(formData.getAll("photos"));
  if (saved.error) return { error: saved.error };
  if (saved.urls!.length === 0) return { error: NO_FILES_ERROR };

  try {
    // createMany: one statement, so it's all-or-nothing in the database.
    await prisma.photo.createMany({
      data: saved.urls!.map((url) => ({
        url,
        type: PhotoType.COMPLETION,
        defectId,
      })),
    });
  } catch {
    // DB write failed after the files hit disk — remove the orphan files.
    await deleteUploadedImages(saved.urls!);
    return { error: "Could not save the photos. Please try again." };
  }

  revalidatePath(`/sub/defects/${defectId}`);
  return {};
}

/** ASSIGNED -> IN_PROGRESS */
export async function startWork(
  defectId: string,
): Promise<{ error?: string }> {
  const user = await requireRole("SUB_CON");

  const defect = await findAssignedDefect(defectId, user.userId);
  if (!defect) return { error: "Defect not found." };
  if (defect.status !== DefectStatus.ASSIGNED) {
    return { error: "This defect is not waiting to be started." };
  }

  await prisma.defect.update({
    where: { id: defectId },
    data: { status: DefectStatus.IN_PROGRESS },
  });

  revalidatePath(`/sub/defects/${defectId}`);
  return {};
}

/** IN_PROGRESS | REOPENED -> COMPLETED (requires at least one completion photo) */
export async function markCompleted(
  defectId: string,
): Promise<{ error?: string }> {
  const user = await requireRole("SUB_CON");

  const defect = await findAssignedDefect(defectId, user.userId);
  if (!defect) return { error: "Defect not found." };
  if (
    defect.status !== DefectStatus.IN_PROGRESS &&
    defect.status !== DefectStatus.REOPENED
  ) {
    return { error: "This defect cannot be marked completed right now." };
  }
  if (defect.photos.length === 0) {
    return { error: "Upload at least one completion photo first." };
  }

  await prisma.defect.update({
    where: { id: defectId },
    data: { status: DefectStatus.COMPLETED },
  });

  revalidatePath(`/sub/defects/${defectId}`);
  return {};
}
