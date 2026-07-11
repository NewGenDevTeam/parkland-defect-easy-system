import Link from "next/link";
import {
  FolderKanban,
  CircleAlert,
  CheckCircle2,
  Archive,
  ArrowRight,
  UserPlus,
  Hammer,
  RotateCcw,
  UsersRound,
  MapPin,
  FileImage,
  ImageOff,
  ChevronRight,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPEN_STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "REOPENED"];
const DONE_STATUSES = ["COMPLETED", "CLOSED"];

export default async function MainDashboard() {
  const user = await requireRole("MAIN_CON");
  const where = { project: { ownerId: user.userId } };

  // Group defect counts by status in a single query, then read each bucket.
  // Project cards reuse one findMany (defect statuses + drawing count included).
  const [projectList, byStatus, activeSubCons] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: user.userId },
      // ACTIVE sorts before COMPLETED (enum definition order), newest first.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        location: true,
        status: true,
        defects: { select: { status: true } },
        _count: { select: { drawings: true } },
      },
    }),
    prisma.defect.groupBy({ by: ["status"], where, _count: true }),
    prisma.user.count({
      where: { role: "SUB_CON", mainConId: user.userId, active: true },
    }),
  ]);
  const projects = projectList.length;

  const count = (status: string) =>
    byStatus.find((g) => g.status === status)?._count ?? 0;

  const stats = [
    { label: "Projects", value: projects, icon: FolderKanban, hint: "Total projects", href: "/main/projects" },
    { label: "New", value: count("NEW"), icon: CircleAlert, hint: "Not yet assigned", href: "/main/defects?status=NEW" },
    { label: "Assigned", value: count("ASSIGNED"), icon: UserPlus, hint: "Waiting for Sub-Con", href: "/main/defects?status=ASSIGNED" },
    { label: "In Progress", value: count("IN_PROGRESS"), icon: Hammer, hint: "Sub-Con working", href: "/main/defects?status=IN_PROGRESS" },
    { label: "Completed", value: count("COMPLETED"), icon: CheckCircle2, hint: "Waiting for your review", href: "/main/defects?status=COMPLETED" },
    { label: "Closed", value: count("CLOSED"), icon: Archive, hint: "Reviewed and closed", href: "/main/defects?status=CLOSED" },
    { label: "Reopened", value: count("REOPENED"), icon: RotateCcw, hint: "Needs rework", href: "/main/defects?status=REOPENED" },
    { label: "Sub-Contractors", value: activeSubCons, icon: UsersRound, hint: "Active teams", href: "/main/sub-contractors" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {user.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your Projects, Floor Plans and Defects.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="block">
            <Card className="h-full cursor-pointer transition-colors hover:border-primary hover:bg-muted/40">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription className="font-medium text-foreground">
                  {s.label}
                </CardDescription>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums">{s.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <FolderKanban className="h-5 w-5" />
              Projects
            </h2>
            <p className="text-sm text-muted-foreground">
              Select a project to view its Floor Plan and Defects.
            </p>
          </div>
          <Link
            href="/main/projects"
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View All Projects
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {projectList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <FolderKanban className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No projects yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first project to upload a Floor Plan and start
                  adding Defects.
                </p>
              </div>
              <Link
                href="/main/projects"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                Create Project
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projectList.map((p) => {
              const total = p.defects.length;
              const open = p.defects.filter((d) =>
                OPEN_STATUSES.includes(d.status),
              ).length;
              const done = p.defects.filter((d) =>
                DONE_STATUSES.includes(d.status),
              ).length;
              const hasFloorPlan = p._count.drawings > 0;
              return (
                <Link
                  key={p.id}
                  href={`/main/projects/${p.id}`}
                  className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Card className="flex h-full cursor-pointer flex-col transition-colors hover:border-primary hover:bg-muted/40">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <Badge
                          variant={p.status === "ACTIVE" ? "default" : "secondary"}
                        >
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
                          <p className="text-lg font-semibold tabular-nums">
                            {total}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Defects
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/60 py-2">
                          <p className="text-lg font-semibold tabular-nums">
                            {open}
                          </p>
                          <p className="text-xs text-muted-foreground">Open</p>
                        </div>
                        <div className="rounded-lg bg-muted/60 py-2">
                          <p className="text-lg font-semibold tabular-nums">
                            {done}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Completed
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        {hasFloorPlan ? (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <FileImage className="h-4 w-4" />
                            Floor Plan uploaded
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <ImageOff className="h-4 w-4" />
                            No Floor Plan
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-primary" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
