import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_BADGE_CLASS,
  PRIORITY_BADGE_CLASS,
  type DefectStatusValue,
  type PriorityValue,
} from "@/lib/defect-ui";

export default async function SubDashboard() {
  const user = await requireRole("SUB_CON");

  const defects = await prisma.defect.findMany({
    where: { assignedToId: user.userId },
    orderBy: { createdAt: "desc" },
    include: { project: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          My Assigned Defects
        </h1>
        <p className="text-sm text-muted-foreground">
          Defects assigned to you across all Projects.
        </p>
      </div>

      {defects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Nothing assigned yet</p>
              <p className="text-sm text-muted-foreground">
                Defects assigned to you by the Main-Con will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {defects.map((d) => (
            <Link key={d.id} href={`/sub/defects/${d.id}`} className="block">
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {d.project.name}
                    </p>
                    <p className="truncate font-medium">{d.title}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge
                        className={STATUS_BADGE_CLASS[d.status as DefectStatusValue]}
                      >
                        {STATUS_LABEL[d.status as DefectStatusValue]}
                      </Badge>
                      <Badge
                        className={
                          PRIORITY_BADGE_CLASS[d.priority as PriorityValue]
                        }
                      >
                        {PRIORITY_LABEL[d.priority as PriorityValue]}
                      </Badge>
                      {d.trade && <Badge variant="outline">{d.trade}</Badge>}
                    </div>
                  </div>
                  <span
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "pointer-events-none hidden shrink-0 sm:inline-flex",
                    )}
                  >
                    Open Defect
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground sm:hidden" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
