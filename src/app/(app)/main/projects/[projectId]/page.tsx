import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, FileImage, Map as MapIcon, ListChecks } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DrawingBoard, type BoardDefect } from "./drawing-board";
import { AddLayoutDialog } from "./add-layout-dialog";
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
      defectTypes: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, isOthers: true, defaultSubConId: true },
      },
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

  // Hierarchy: one optional Master Layout (overview) + Unit/Floor Layouts.
  const master = project.drawings.find((dr) => dr.isMaster) ?? null;
  const units = project.drawings.filter((dr) => !dr.isMaster);

  // Which floor plan to show: a ?defectId= deep link wins (open the drawing
  // that defect sits on), then an explicit ?drawingId=, then the Master
  // Layout (unit picker), then the first unit.
  const linkedDefect = defectId
    ? project.defects.find((d) => d.id === defectId)
    : undefined;
  const drawing =
    (linkedDefect &&
      project.drawings.find((dr) => dr.id === linkedDefect.drawingId)) ??
    project.drawings.find((dr) => dr.id === drawingId) ??
    master ??
    project.drawings[0] ??
    null;
  const viewingMaster = drawing !== null && drawing.id === master?.id;

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
      .map((p) => ({
        id: p.id,
        url: p.url,
        media: p.media as "IMAGE" | "VIDEO",
        createdAt: p.createdAt.toISOString(),
      })),
    completionPhotos: d.photos
      .filter((p) => p.type === "COMPLETION")
      .map((p) => ({
        id: p.id,
        url: p.url,
        media: p.media as "IMAGE" | "VIDEO",
        createdAt: p.createdAt.toISOString(),
      })),
  }));

  // Defect count per unit for the Master Layout unit picker.
  const defectCountByDrawing = new Map<string, number>();
  for (const d of project.defects) {
    defectCountByDrawing.set(
      d.drawingId,
      (defectCountByDrawing.get(d.drawingId) ?? 0) + 1,
    );
  }

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {drawing
                ? viewingMaster
                  ? "Master Layout"
                  : `${drawing.name} (${defects.length} Defect${defects.length === 1 ? "" : "s"})`
                : "Floor Plan"}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <AddLayoutDialog projectId={project.id} hasMaster={master !== null} />
              <Link
                href={`/main/projects/${project.id}/defect-types`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "max-md:h-11 max-md:px-3 no-underline",
                )}
              >
                <ListChecks className="h-4 w-4" />
                Defect Types
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Compact layout selector: Master Layout first, then unit layouts.
              Plain links so the chosen layout lives in the URL and survives
              refresh / sharing. Tall targets for mobile taps. */}
          {project.drawings.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {master && (
                <Link
                  href={`/main/projects/${project.id}?drawingId=${master.id}`}
                  className={cn(
                    "flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium no-underline transition-colors",
                    viewingMaster
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:border-primary hover:text-foreground",
                  )}
                >
                  <MapIcon className="h-4 w-4" />
                  Master
                </Link>
              )}
              {units.map((dr) => (
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
            drawingLabel={
              drawing ? `${project.name} — ${viewingMaster ? "Master Layout" : drawing.name}` : ""
            }
            isMaster={viewingMaster}
            defects={defects}
            defectTypes={project.defectTypes}
            subCons={subCons}
            initialDefectId={
              defectId && defects.some((d) => d.id === defectId)
                ? defectId
                : null
            }
          />

          {/* Master Layout view: pick the Unit/Floor Layout to register on. */}
          {viewingMaster && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Select a Unit/Floor Layout</p>
              {units.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Unit Layouts yet. Use “Add Layout” to upload one (e.g.
                  A-11), then add defects on it.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {units.map((dr) => (
                    <Link
                      key={dr.id}
                      href={`/main/projects/${project.id}?drawingId=${dr.id}`}
                      className="flex min-h-12 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-medium no-underline transition-colors hover:border-primary"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FileImage className="h-4 w-4 shrink-0" />
                        <span className="truncate">{dr.name}</span>
                      </span>
                      <Badge variant="secondary">
                        {defectCountByDrawing.get(dr.id) ?? 0}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
