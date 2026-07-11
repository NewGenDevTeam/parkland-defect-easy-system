import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubConList, type SubConRow } from "./sub-con-list";

export default async function SubContractorsPage() {
  const user = await requireRole("MAIN_CON");

  // Only Sub-Cons created under this Main-Con — never other Main-Cons' teams.
  const subCons = await prisma.user.findMany({
    where: { role: "SUB_CON", mainConId: user.userId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      companyName: true,
      department: true,
      phone: true,
      active: true,
    },
  });

  const rows: SubConRow[] = subCons.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    companyName: s.companyName,
    department: s.department,
    phone: s.phone,
    active: s.active,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sub-Contractors
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage companies and departments that receive defect assignments.
        </p>
      </div>
      <SubConList subCons={rows} />
    </div>
  );
}
