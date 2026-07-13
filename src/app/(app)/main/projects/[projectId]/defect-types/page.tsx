import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DefectTypeList, type DefectTypeRow } from "./defect-type-list";

export default async function DefectTypesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireRole("MAIN_CON");
  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.userId },
    select: {
      id: true,
      name: true,
      defectTypes: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          active: true,
          isOthers: true,
          defaultSubConId: true,
        },
      },
    },
  });
  if (!project) notFound();

  // Same option list as the Quick Add form: ACTIVE Sub-Cons of this Main-Con.
  const subConUsers = await prisma.user.findMany({
    where: { role: "SUB_CON", mainConId: user.userId, active: true },
    select: { id: true, name: true, companyName: true, department: true },
    orderBy: { name: "asc" },
  });
  const subCons = subConUsers.map((s) => ({
    id: s.id,
    label: `${s.companyName || s.name}${s.department ? ` — ${s.department}` : ""}`,
  }));

  const rows: DefectTypeRow[] = project.defectTypes.map((t) => ({
    id: t.id,
    name: t.name,
    active: t.active,
    isOthers: t.isOthers,
    defaultSubConId: t.defaultSubConId,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/main/projects/${project.id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {project.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Defect Types</h1>
        <p className="text-sm text-muted-foreground">
          The Quick Add dropdown for this project. Set a default Sub-Con to
          preselect it automatically.
        </p>
      </div>
      <DefectTypeList projectId={project.id} types={rows} subCons={subCons} />
    </div>
  );
}
