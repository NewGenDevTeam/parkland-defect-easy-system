import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
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
          <CardTitle className="text-base">Defect photos</CardTitle>
        </CardHeader>
        <CardContent>
          {defectPhotos.length > 0 ? (
            <PhotoGrid photos={defectPhotos} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No defect photos yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location on floor plan</CardTitle>
        </CardHeader>
        <CardContent>
          {defect.drawing ? (
            <div className="relative w-full overflow-hidden rounded-xl border bg-muted/30">
              <Image
                src={defect.drawing.imageUrl}
                alt="Floor plan"
                width={1600}
                height={1200}
                className="h-auto w-full"
                unoptimized
              />
              <span
                style={{ left: `${defect.x * 100}%`, top: `${defect.y * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-full"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-white shadow-md ${STATUS_PIN_COLOR[status]}`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                </span>
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No floor plan available.
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
