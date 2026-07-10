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
    { label: "Projects", value: projects, icon: FolderKanban, hint: "Total projects", href: "/main/projects" },
    { label: "New", value: count("NEW"), icon: CircleAlert, hint: "Not yet assigned", href: "/main/defects?status=NEW" },
    { label: "Assigned", value: count("ASSIGNED"), icon: UserPlus, hint: "Waiting for Sub-Con", href: "/main/defects?status=ASSIGNED" },
    { label: "In Progress", value: count("IN_PROGRESS"), icon: Hammer, hint: "Sub-Con working", href: "/main/defects?status=IN_PROGRESS" },
    { label: "Completed", value: count("COMPLETED"), icon: CheckCircle2, hint: "Waiting for your review", href: "/main/defects?status=COMPLETED" },
    { label: "Closed", value: count("CLOSED"), icon: Archive, hint: "Reviewed and closed", href: "/main/defects?status=CLOSED" },
    { label: "Reopened", value: count("REOPENED"), icon: RotateCcw, hint: "Needs rework", href: "/main/defects?status=REOPENED" },
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Projects
          </CardTitle>
          <CardDescription>
            Open a Project to upload its Floor Plan and add Defect pins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/main/projects"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Open Projects
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
