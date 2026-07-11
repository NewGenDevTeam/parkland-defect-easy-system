import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhotoGrid } from "@/components/photo-grid";
import { FloorPlanViewer } from "@/components/floor-plan-viewer";
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_BADGE_CLASS,
  PRIORITY_BADGE_CLASS,
  STATUS_PIN_COLOR,
  type DefectStatusValue,
  type PriorityValue,
} from "@/lib/defect-ui";
import { CompletionPanel } from "./completion-panel";

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
      drawing: { select: { imageUrl: true } },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!defect) notFound();

  const status = defect.status as DefectStatusValue;
  const priority = defect.priority as PriorityValue;

  const defectPhotos = defect.photos
    .filter((p) => p.type === "DEFECT")
    .map((p) => ({ id: p.id, url: p.url }));
  const completionPhotos = defect.photos
    .filter((p) => p.type === "COMPLETION")
    .map((p) => ({ id: p.id, url: p.url }));

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
            <>
              {/* Read-only viewer: auto-zooms and centers on this defect's pin.
                  Sub-Con can pan/zoom but cannot add or move pins. */}
              <FloorPlanViewer
                imageUrl={defect.drawing.imageUrl}
                pins={[
                  {
                    id: defect.id,
                    x: defect.x,
                    y: defect.y,
                    colorClass: STATUS_PIN_COLOR[status],
                    title: defect.title,
                  },
                ]}
                selectedPinId={defect.id}
                focusPoint={{ x: defect.x, y: defect.y }}
              />
              <p className="text-xs text-muted-foreground">
                Highlighted point shows the affected location.
              </p>
            </>
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
        Created {defect.createdAt.toLocaleDateString()}
      </p>
    </div>
  );
}
