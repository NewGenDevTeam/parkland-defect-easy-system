import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, FileImage } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DrawingBoard, type BoardDefect } from "./drawing-board";
import type { DefectStatusValue, PriorityValue } from "@/lib/defect-ui";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ defectId?: string; drawingId?: string }>;
}) {
  const user = await requireRole("MAIN_CON");
  const { projectId } = await params;
  const { defectId, drawingId } = await searchParams;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.userId },
    include: {
      drawings: { orderBy: { createdAt: "asc" } },
      defects: {
        orderBy: { createdAt: "desc" },
        include: {
          assignedTo: { select: { name: true } },
          photos: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!project) notFound();

  // Assignment options: only ACTIVE Sub-Cons created under this Main-Con.
  // Label: "Company — Department", falling back to the team name.
  const subConUsers = await prisma.user.findMany({
    where: { role: "SUB_CON", mainConId: user.userId, active: true },
    select: { id: true, name: true, companyName: true, department: true },
    orderBy: { name: "asc" },
  });
  const subCons = subConUsers.map((s) => ({
    id: s.id,
    label: `${s.companyName || s.name}${s.department ? ` — ${s.department}` : ""}`,
  }));

  // Which floor plan to show: a ?defectId= deep link wins (open the drawing
  // that defect sits on), then an explicit ?drawingId=, then the first one.
  const linkedDefect = defectId
    ? project.defects.find((d) => d.id === defectId)
    : undefined;
  const drawing =
    (linkedDefect &&
      project.drawings.find((dr) => dr.id === linkedDefect.drawingId)) ??
    project.drawings.find((dr) => dr.id === drawingId) ??
    project.drawings[0] ??
    null;

  // Stable pin numbers: 1, 2, 3… in creation order, regardless of list order.
  const pinNumberById = new Map(
    [...project.defects]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((d, i) => [d.id, i + 1]),
  );

  // Only pins that belong to the drawing on screen.
  const boardDefects = drawing
    ? project.defects.filter((d) => d.drawingId === drawing.id)
    : [];

  const defects: BoardDefect[] = boardDefects.map((d) => ({
    id: d.id,
    pinNumber: pinNumberById.get(d.id) ?? 0,
    title: d.title,
    description: d.description,
    trade: d.trade,
    priority: d.priority as PriorityValue,
    status: d.status as DefectStatusValue,
    x: d.x,
    y: d.y,
    assignedToId: d.assignedToId,
    assignedToName: d.assignedTo?.name ?? null,
    reopenReason: d.reopenReason,
    createdAt: d.createdAt.toISOString(),
    defectPhotos: d.photos
      .filter((p) => p.type === "DEFECT")
      .map((p) => ({ id: p.id, url: p.url })),
    completionPhotos: d.photos
      .filter((p) => p.type === "COMPLETION")
      .map((p) => ({ id: p.id, url: p.url })),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/main/projects"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            {project.location && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {project.location}
              </p>
            )}
          </div>
          <Badge variant={project.status === "ACTIVE" ? "default" : "secondary"}>
            {project.status === "ACTIVE" ? "Active" : "Completed"}
          </Badge>
        </div>
        {project.description && (
          <p className="mt-2 text-sm text-muted-foreground">
            {project.description}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Floor Plan &amp; Defects ({defects.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drawing selector — only when the project has several floor plans.
              Plain links so the chosen drawing lives in the URL and survives
              refresh / sharing. Tall targets for mobile taps. */}
          {project.drawings.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {project.drawings.map((dr) => (
                <Link
                  key={dr.id}
                  href={`/main/projects/${project.id}?drawingId=${dr.id}`}
                  className={cn(
                    "flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium no-underline transition-colors",
                    dr.id === drawing?.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:border-primary hover:text-foreground",
                  )}
                >
                  <FileImage className="h-4 w-4" />
                  {dr.name}
                </Link>
              ))}
            </div>
          )}
          <DrawingBoard
            key={drawing?.id ?? "none"}
            projectId={project.id}
            drawing={drawing ? { id: drawing.id, imageUrl: drawing.imageUrl } : null}
            defects={defects}
            subCons={subCons}
            initialDefectId={
              defectId && defects.some((d) => d.id === defectId)
                ? defectId
                : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
