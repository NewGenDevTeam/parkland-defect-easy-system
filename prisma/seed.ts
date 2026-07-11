import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = await bcrypt.hash("Demo@123456", 10);

  const mainCon = await prisma.user.upsert({
    where: { email: "maincon@parkland.com" },
    update: {},
    create: {
      email: "maincon@parkland.com",
      name: "Main Contractor",
      passwordHash: password,
      role: "MAIN_CON",
    },
  });

  // The seeded sub-con belongs to the seeded main-con (Phase 5 ownership).
  // The update block also links legacy rows where mainConId is still null,
  // without touching their password.
  const subCon = await prisma.user.upsert({
    where: { email: "subcon@parkland.com" },
    update: {
      mainConId: mainCon.id,
      companyName: "Parkland Sub-Contractor",
      department: "General Works",
      active: true,
    },
    create: {
      email: "subcon@parkland.com",
      name: "Sub Contractor",
      companyName: "Parkland Sub-Contractor",
      department: "General Works",
      passwordHash: password,
      role: "SUB_CON",
      mainConId: mainCon.id,
    },
  });

  console.log("Seeded users:");
  console.log(`  ${mainCon.email} (${mainCon.role})`);
  console.log(`  ${subCon.email} (${subCon.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
