import Link from "next/link";
import { MapPin, FolderKanban, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateProjectDialog } from "./create-project-dialog";

export default async function ProjectsPage() {
  const user = await requireRole("MAIN_CON");

  const projects = await prisma.project.findMany({
    where: { ownerId: user.userId },
    orderBy: { createdAt: "desc" },
    include: { defects: { select: { status: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Manage your projects and floor-plan defects.
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FolderKanban className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No Projects yet</p>
              <p className="text-sm text-muted-foreground">
                Click the &ldquo;New Project&rdquo; button above to create your
                first Project.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const total = p.defects.length;
            const completed = p.defects.filter(
              (d) => d.status === "COMPLETED",
            ).length;
            const closed = p.defects.filter(
              (d) => d.status === "CLOSED",
            ).length;
            const open = total - completed - closed;
            return (
              <Link key={p.id} href={`/main/projects/${p.id}`} className="block">
                <Card className="flex h-full flex-col transition-colors hover:border-primary">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <Badge variant={p.status === "ACTIVE" ? "default" : "secondary"}>
                        {p.status === "ACTIVE" ? "Active" : "Completed"}
                      </Badge>
                    </div>
                    {p.location && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {p.location}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="mt-auto space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/60 py-2">
                        <p className="text-lg font-semibold tabular-nums">{total}</p>
                        <p className="text-xs text-muted-foreground">Defects</p>
                      </div>
                      <div className="rounded-lg bg-muted/60 py-2">
                        <p className="text-lg font-semibold tabular-nums">{open}</p>
                        <p className="text-xs text-muted-foreground">Open</p>
                      </div>
                      <div className="rounded-lg bg-muted/60 py-2">
                        <p className="text-lg font-semibold tabular-nums">{completed}</p>
                        <p className="text-xs text-muted-foreground">Completed</p>
                      </div>
                    </div>
                    <p className="flex items-center justify-end gap-1 text-sm font-medium text-primary">
                      View Project
                      <ChevronRight className="h-4 w-4" />
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
