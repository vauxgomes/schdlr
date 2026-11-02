/*
  Warnings:

  - You are about to drop the column `is_teacher` on the `unit_members` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "offerings" DROP CONSTRAINT "offerings_teacher_id_fkey";

-- AlterTable
ALTER TABLE "unit_members" DROP COLUMN "is_teacher";

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teachers_user_id_idx" ON "teachers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_organization_id_name_key" ON "teachers"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_organization_id_user_id_key" ON "teachers"("organization_id", "user_id");

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
