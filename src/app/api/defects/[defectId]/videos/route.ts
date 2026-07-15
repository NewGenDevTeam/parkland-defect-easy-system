import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saveUploadedVideo, deleteUploadedVideo } from "@/lib/video-upload";
import { NO_VIDEO_ERROR } from "@/lib/video-limits";
import { MediaType, PhotoType, Role } from "@/generated/prisma/enums";

/**
 * POST /api/defects/<defectId>/videos — upload ONE short video as defect
 * evidence. The video is stored as a regular Photo row with media = VIDEO
 * (type DEFECT for Main-Con, COMPLETION for Sub-Con) so it shows up alongside
 * the existing photo evidence.
 *
 * A Route Handler (not a Server Action) so a 30MB video never competes with
 * the Server Action body limit that is sized for photo batches, and so the
 * client's XMLHttpRequest can show real upload progress. The proxy matcher
 * excludes /api, so this route does its own full session + active-account
 * check, mirroring requireUser() but answering 401/404 JSON instead of
 * redirecting.
 *
 * Uploading a video NEVER changes the defect status — the existing Start
 * Work / Mark Completed / Close / Reopen actions stay in charge of that.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ defectId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }
  // Same DB re-check as requireUser(): deactivated/deleted accounts are
  // blocked immediately, never trusted from the JWT alone.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, active: true },
  });
  if (!user || !user.active) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { defectId } = await params;

  // Authorization mirrors the existing rules exactly:
  // MAIN_CON → defects in projects they own; SUB_CON → defects assigned to them.
  const defect = await prisma.defect.findFirst({
    where:
      user.role === Role.MAIN_CON
        ? { id: defectId, project: { ownerId: user.id } }
        : { id: defectId, assignedToId: user.id },
    select: { id: true, projectId: true },
  });
  if (!defect) {
    return Response.json({ error: "Defect not found." }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: NO_VIDEO_ERROR }, { status: 400 });
  }

  // Validates type/size/emptiness and writes to uploads/videos/<defectId>/.
  const saved = await saveUploadedVideo(formData.get("video"), defect.id);
  if (saved.error) {
    return Response.json({ error: saved.error }, { status: 400 });
  }

  try {
    await prisma.photo.create({
      data: {
        url: saved.url!,
        media: MediaType.VIDEO,
        // Same evidence bucket the role's photos go into.
        type:
          user.role === Role.MAIN_CON ? PhotoType.DEFECT : PhotoType.COMPLETION,
        defectId: defect.id,
      },
    });
  } catch {
    // DB write failed after the file hit disk — remove the orphan file.
    await deleteUploadedVideo(saved.url!);
    return Response.json(
      { error: "Could not save the video. Please try again." },
      { status: 500 },
    );
  }

  // Refresh both detail surfaces (Main-Con project board, Sub-Con page).
  revalidatePath(`/main/projects/${defect.projectId}`);
  revalidatePath(`/sub/defects/${defect.id}`);
  return Response.json({ ok: true });
}
