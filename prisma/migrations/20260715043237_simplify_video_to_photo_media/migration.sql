/*
  Warnings:

  - You are about to drop the `DefectVideo` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- DropForeignKey
ALTER TABLE "DefectVideo" DROP CONSTRAINT "DefectVideo_defectId_fkey";

-- DropForeignKey
ALTER TABLE "DefectVideo" DROP CONSTRAINT "DefectVideo_uploadedById_fkey";

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "media" "MediaType" NOT NULL DEFAULT 'IMAGE';

-- DropTable
DROP TABLE "DefectVideo";

-- DropEnum
DROP TYPE "VideoCategory";
