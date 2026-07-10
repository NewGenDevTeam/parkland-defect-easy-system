import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DefectStatus } from "@/generated/prisma/enums";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_BADGE_CLASS,
  PRIORITY_BADGE_CLASS,
  type DefectStatusValue,
  type PriorityValue,
} from "@/lib/defect-ui";

const ALL_STATUSES = Object.keys(STATUS_LABEL) as DefectStatusValue[];

export default async function MainDefectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireRole("MAIN_CON");
  const { status } = await searchParams;

  // Only accept a valid DefectStatus; anything else shows all defects.
  const statusFilter =
    status && status in DefectStatus ? (status as DefectStatusValue) : null;

  const defects = await prisma.defect.findMany({
    where: {
      project: { ownerId: user.userId },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      assignedTo: { select: { name: true, email: true } },
    },
  });

  const title = statusFilter
    ? `${STATUS_LABEL[statusFilter]} Defects`
    : "All Defects";

  const chips: { label: string; href: string; active: boolean }[] = [
    { label: "All", href: "/main/defects", active: !statusFilter },
    ...ALL_STATUSES.map((s) => ({
      label: STATUS_LABEL[s],
      href: `/main/defects?status=${s}`,
      active: statusFilter === s,
    })),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Defects across all your Projects.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium no-underline transition-colors",
              c.active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {defects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No defects found for this status.</p>
              <p className="text-sm text-muted-foreground">
                Try another status filter or open a Project to add defects.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {defects.map((d) => (
            <Link
              key={d.id}
              href={`/main/projects/${d.project.id}?defectId=${d.id}`}
              className="block"
            >
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {d.project.name}
                    </p>
                    <p className="truncate font-medium">{d.title}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge
                        className={
                          STATUS_BADGE_CLASS[d.status as DefectStatusValue]
                        }
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
                    <p className="pt-1 text-xs text-muted-foreground">
                      {d.assignedTo
                        ? `Assigned to ${d.assignedTo.name} (${d.assignedTo.email})`
                        : "Not assigned yet"}
                      {" · Created "}
                      {d.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
