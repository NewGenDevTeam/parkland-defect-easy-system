-- AlterTable
ALTER TABLE "Defect" ADD COLUMN     "defectTypeId" TEXT;

-- AlterTable
ALTER TABLE "Drawing" ADD COLUMN     "isMaster" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DefectType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isOthers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "defaultSubConId" TEXT,

    CONSTRAINT "DefectType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DefectType_projectId_idx" ON "DefectType"("projectId");

-- CreateIndex
CREATE INDEX "Defect_defectTypeId_idx" ON "Defect"("defectTypeId");

-- AddForeignKey
ALTER TABLE "DefectType" ADD CONSTRAINT "DefectType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectType" ADD CONSTRAINT "DefectType_defaultSubConId_fkey" FOREIGN KEY ("defaultSubConId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_defectTypeId_fkey" FOREIGN KEY ("defectTypeId") REFERENCES "DefectType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
