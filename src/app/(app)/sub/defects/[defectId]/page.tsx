import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhotoGrid } from "@/components/photo-grid";
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_BADGE_CLASS,
  PRIORITY_BADGE_CLASS,
  type DefectStatusValue,
  type PriorityValue,
} from "@/lib/defect-ui";
import { formatMalaysiaDate } from "@/lib/format-date";
import { CompletionPanel } from "./completion-panel";
import { DefectPinModal } from "./defect-pin-modal";

export default async function SubDefectDetailPage({
  params,
}: {
  params: Promise<{ defectId: string }>;
}) {
  const user = await requireRole("SUB_CON");
  const { defectId } = await params;

  // Access control: a sub-con can only open defects assigned to them.
  const defect = await prisma.defect.findFirst({
    where: { id: defectId, assignedToId: user.userId },
    include: {
      project: { select: { name: true, location: true } },
      drawing: { select: { name: true, imageUrl: true } },
      assignedTo: {
        select: { name: true, companyName: true, department: true },
      },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!defect) notFound();

  const status = defect.status as DefectStatusValue;
  const priority = defect.priority as PriorityValue;

  const defectPhotos = defect.photos
    .filter((p) => p.type === "DEFECT")
    .map((p) => ({
      id: p.id,
      url: p.url,
      media: p.media as "IMAGE" | "VIDEO",
      createdAt: p.createdAt.toISOString(),
    }));
  const completionPhotos = defect.photos
    .filter((p) => p.type === "COMPLETION")
    .map((p) => ({
      id: p.id,
      url: p.url,
      media: p.media as "IMAGE" | "VIDEO",
      createdAt: p.createdAt.toISOString(),
    }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/sub"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          My Defects
        </Link>
        <p className="text-xs text-muted-foreground">{defect.project.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{defect.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge className={STATUS_BADGE_CLASS[status]}>
            {STATUS_LABEL[status]}
          </Badge>
          <Badge className={PRIORITY_BADGE_CLASS[priority]}>
            {PRIORITY_LABEL[priority]} priority
          </Badge>
          {defect.trade && <Badge variant="outline">{defect.trade}</Badge>}
        </div>
      </div>

      {status === "REOPENED" && defect.reopenReason && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <span className="font-medium">Reopened — reason:</span>{" "}
          {defect.reopenReason}
        </div>
      )}

      {defect.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {defect.description}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Defect Photos</CardTitle>
        </CardHeader>
        <CardContent>
          {defectPhotos.length > 0 ? (
            <PhotoGrid photos={defectPhotos} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No Defect Photos yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location on Floor Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {defect.drawing ? (
            <DefectPinModal
              imageUrl={defect.drawing.imageUrl}
              defect={{
                id: defect.id,
                title: defect.title,
                description: defect.description,
                trade: defect.trade,
                priority,
                status,
                x: defect.x,
                y: defect.y,
                reopenReason: defect.reopenReason,
                createdAt: defect.createdAt.toISOString(),
                projectName: defect.project.name,
                projectLocation: defect.project.location,
                drawingName: defect.drawing.name,
                // Same "Company — Department" label the Main-Con board uses.
                assignedToLabel: defect.assignedTo
                  ? `${defect.assignedTo.companyName || defect.assignedTo.name}${
                      defect.assignedTo.department
                        ? ` — ${defect.assignedTo.department}`
                        : ""
                    }`
                  : null,
              }}
              defectPhotos={defectPhotos}
              completionPhotos={completionPhotos}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No Floor Plan available.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Completion</CardTitle>
        </CardHeader>
        <CardContent>
          <CompletionPanel
            defectId={defect.id}
            status={status}
            completionPhotos={completionPhotos}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Created {formatMalaysiaDate(defect.createdAt)}
      </p>
    </div>
  );
}
