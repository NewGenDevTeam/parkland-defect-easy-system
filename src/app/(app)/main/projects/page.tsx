import Link from "next/link";
import { MapPin, ClipboardList, FolderKanban } from "lucide-react";
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
    include: { _count: { select: { defects: true } } },
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
              <p className="font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first project to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/main/projects/${p.id}`} className="block">
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <Badge variant={p.status === "ACTIVE" ? "default" : "secondary"}>
                      {p.status === "ACTIVE" ? "Active" : "Completed"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {p.location && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {p.location}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <ClipboardList className="h-4 w-4" />
                    {p._count.defects} defect{p._count.defects === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
