import Link from "next/link";
import {
  FolderKanban,
  CircleAlert,
  Clock3,
  CheckCircle2,
  ArrowRight,
  UserPlus,
  Hammer,
  RotateCcw,
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function MainDashboard() {
  const user = await requireRole("MAIN_CON");
  const where = { project: { ownerId: user.userId } };

  // Group defect counts by status in a single query, then read each bucket.
  const [projects, byStatus] = await Promise.all([
    prisma.project.count({ where: { ownerId: user.userId } }),
    prisma.defect.groupBy({ by: ["status"], where, _count: true }),
  ]);

  const count = (status: string) =>
    byStatus.find((g) => g.status === status)?._count ?? 0;

  const stats = [
    { label: "Projects", value: projects, icon: FolderKanban },
    { label: "New", value: count("NEW"), icon: CircleAlert },
    { label: "Assigned", value: count("ASSIGNED"), icon: UserPlus },
    { label: "In Progress", value: count("IN_PROGRESS"), icon: Hammer },
    { label: "Completed", value: count("COMPLETED"), icon: Clock3 },
    { label: "Closed", value: count("CLOSED"), icon: CheckCircle2 },
    { label: "Reopened", value: count("REOPENED"), icon: RotateCcw },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {user.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your projects, floor plans and defects.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>{s.label}</CardDescription>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Projects
          </CardTitle>
          <CardDescription>
            Open a project to upload its floor plan and drop defect pins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/main/projects"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Go to projects
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
