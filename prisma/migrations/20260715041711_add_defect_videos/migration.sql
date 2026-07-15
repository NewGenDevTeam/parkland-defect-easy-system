-- CreateEnum
CREATE TYPE "VideoCategory" AS ENUM ('DEFECT', 'PROGRESS', 'COMPLETION', 'REVIEW', 'REOPEN');

-- CreateTable
CREATE TABLE "DefectVideo" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "category" "VideoCategory" NOT NULL,
    "note" TEXT,
    "defectStatus" "DefectStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "defectId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "DefectVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DefectVideo_defectId_idx" ON "DefectVideo"("defectId");

-- CreateIndex
CREATE INDEX "DefectVideo_uploadedById_idx" ON "DefectVideo"("uploadedById");

-- AddForeignKey
ALTER TABLE "DefectVideo" ADD CONSTRAINT "DefectVideo_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectVideo" ADD CONSTRAINT "DefectVideo_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
