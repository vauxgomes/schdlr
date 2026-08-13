-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('SUPPORT', 'ADMIN');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('ADMIN', 'MANAGER', 'COORDINATOR', 'TEACHER');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TermStatus" AS ENUM ('PLANNING', 'ADJUSTMENTS', 'STARTED', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('CLASSROOM', 'LAB', 'COMPUTER_LAB', 'AUDITORIUM', 'LIBRARY', 'MEETING_ROOM', 'GYM', 'COURT', 'POOL', 'FIELD', 'OTHER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('UNIT_INVITE', 'MEMBER_ACTIVATED', 'MEMBER_DEACTIVATED', 'PROJECT_ASSISTANT_ADDED', 'TERM_STARTED', 'SUBSCRIPTION_EXPIRING', 'SUBSCRIPTION_EXPIRED');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('GRACE', 'TRIAL', 'BASIC', 'PRO', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL DEFAULT 'TRIAL',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "staff_role" "StaffRole",
    "subscription_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "working_days" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_members" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "roles" "MemberRole"[] DEFAULT ARRAY['TEACHER']::"MemberRole"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_invites" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "user_id" TEXT,
    "roles" "MemberRole"[],
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "resent_at" TIMESTAMP(3),
    "resent_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "reference_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplines" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "workload" INTEGER NOT NULL,
    "required_location_type" "LocationType",
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricula" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_disciplines" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "discipline_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "weekly_lessons" INTEGER NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "capacity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "TermStatus" NOT NULL DEFAULT 'PLANNING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetables" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_slots" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "timetable_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" INTEGER NOT NULL,
    "end_time" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "curriculum_discipline_id" TEXT NOT NULL,
    "member_id" TEXT,
    "variant" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "timetable_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_slots" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "time_slot_id" TEXT NOT NULL,
    "week_day" INTEGER NOT NULL,
    "offer_id" TEXT,
    "location_id" TEXT,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_subscription_id_key" ON "users"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_owner_id_idx" ON "organizations"("owner_id");

-- CreateIndex
CREATE INDEX "units_organization_id_idx" ON "units"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_organization_id_slug_key" ON "units"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "unit_members_unit_id_idx" ON "unit_members"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_members_user_id_unit_id_key" ON "unit_members"("user_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_members_id_unit_id_key" ON "unit_members"("id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_invites_token_key" ON "unit_invites"("token");

-- CreateIndex
CREATE INDEX "unit_invites_unit_id_status_idx" ON "unit_invites"("unit_id", "status");

-- CreateIndex
CREATE INDEX "unit_invites_email_idx" ON "unit_invites"("email");

-- CreateIndex
CREATE INDEX "unit_invites_user_id_idx" ON "unit_invites"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "courses_unit_id_idx" ON "courses"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_unit_id_code_key" ON "courses"("unit_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "courses_id_unit_id_key" ON "courses"("id", "unit_id");

-- CreateIndex
CREATE INDEX "disciplines_unit_id_idx" ON "disciplines"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_unit_id_code_key" ON "disciplines"("unit_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_id_unit_id_key" ON "disciplines"("id", "unit_id");

-- CreateIndex
CREATE INDEX "curricula_unit_id_idx" ON "curricula"("unit_id");

-- CreateIndex
CREATE INDEX "curricula_course_id_idx" ON "curricula"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_course_id_name_key" ON "curricula"("course_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_id_unit_id_key" ON "curricula"("id", "unit_id");

-- CreateIndex
CREATE INDEX "curriculum_disciplines_curriculum_id_level_idx" ON "curriculum_disciplines"("curriculum_id", "level");

-- CreateIndex
CREATE INDEX "curriculum_disciplines_discipline_id_idx" ON "curriculum_disciplines"("discipline_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_disciplines_curriculum_id_discipline_id_key" ON "curriculum_disciplines"("curriculum_id", "discipline_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_disciplines_id_unit_id_key" ON "curriculum_disciplines"("id", "unit_id");

-- CreateIndex
CREATE INDEX "locations_unit_id_idx" ON "locations"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_unit_id_name_key" ON "locations"("unit_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "locations_id_unit_id_key" ON "locations"("id", "unit_id");

-- CreateIndex
CREATE INDEX "terms_unit_id_idx" ON "terms"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "terms_unit_id_name_key" ON "terms"("unit_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "terms_id_unit_id_key" ON "terms"("id", "unit_id");

-- CreateIndex
CREATE INDEX "timetables_unit_id_idx" ON "timetables"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetables_unit_id_name_key" ON "timetables"("unit_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "timetables_id_unit_id_key" ON "timetables"("id", "unit_id");

-- CreateIndex
CREATE INDEX "time_slots_timetable_id_idx" ON "time_slots"("timetable_id");

-- CreateIndex
CREATE UNIQUE INDEX "time_slots_timetable_id_start_time_key" ON "time_slots"("timetable_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "time_slots_id_unit_id_key" ON "time_slots"("id", "unit_id");

-- CreateIndex
CREATE INDEX "projects_unit_id_term_id_idx" ON "projects"("unit_id", "term_id");

-- CreateIndex
CREATE INDEX "projects_curriculum_id_idx" ON "projects"("curriculum_id");

-- CreateIndex
CREATE INDEX "projects_created_by_id_idx" ON "projects"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_term_id_curriculum_id_key" ON "projects"("term_id", "curriculum_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_unit_id_key" ON "projects"("id", "unit_id");

-- CreateIndex
CREATE INDEX "project_members_member_id_idx" ON "project_members"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_member_id_key" ON "project_members"("project_id", "member_id");

-- CreateIndex
CREATE INDEX "offers_project_id_idx" ON "offers"("project_id");

-- CreateIndex
CREATE INDEX "offers_curriculum_discipline_id_idx" ON "offers"("curriculum_discipline_id");

-- CreateIndex
CREATE INDEX "offers_member_id_idx" ON "offers"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "offers_project_id_curriculum_discipline_id_variant_key" ON "offers"("project_id", "curriculum_discipline_id", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "offers_id_unit_id_key" ON "offers"("id", "unit_id");

-- CreateIndex
CREATE INDEX "boards_project_id_idx" ON "boards"("project_id");

-- CreateIndex
CREATE INDEX "boards_timetable_id_idx" ON "boards"("timetable_id");

-- CreateIndex
CREATE UNIQUE INDEX "boards_project_id_name_key" ON "boards"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "boards_id_unit_id_key" ON "boards"("id", "unit_id");

-- CreateIndex
CREATE INDEX "board_slots_unit_id_week_day_idx" ON "board_slots"("unit_id", "week_day");

-- CreateIndex
CREATE INDEX "board_slots_location_id_idx" ON "board_slots"("location_id");

-- CreateIndex
CREATE INDEX "board_slots_offer_id_idx" ON "board_slots"("offer_id");

-- CreateIndex
CREATE INDEX "board_slots_time_slot_id_idx" ON "board_slots"("time_slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "board_slots_board_id_time_slot_id_week_day_key" ON "board_slots"("board_id", "time_slot_id", "week_day");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_members" ADD CONSTRAINT "unit_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_members" ADD CONSTRAINT "unit_members_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_invites" ADD CONSTRAINT "unit_invites_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_invites" ADD CONSTRAINT "unit_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_invites" ADD CONSTRAINT "unit_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_invites" ADD CONSTRAINT "unit_invites_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_invites" ADD CONSTRAINT "unit_invites_resent_by_id_fkey" FOREIGN KEY ("resent_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_course_id_unit_id_fkey" FOREIGN KEY ("course_id", "unit_id") REFERENCES "courses"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_disciplines" ADD CONSTRAINT "curriculum_disciplines_curriculum_id_unit_id_fkey" FOREIGN KEY ("curriculum_id", "unit_id") REFERENCES "curricula"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_disciplines" ADD CONSTRAINT "curriculum_disciplines_discipline_id_unit_id_fkey" FOREIGN KEY ("discipline_id", "unit_id") REFERENCES "disciplines"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_timetable_id_unit_id_fkey" FOREIGN KEY ("timetable_id", "unit_id") REFERENCES "timetables"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_term_id_unit_id_fkey" FOREIGN KEY ("term_id", "unit_id") REFERENCES "terms"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_curriculum_id_unit_id_fkey" FOREIGN KEY ("curriculum_id", "unit_id") REFERENCES "curricula"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_unit_id_fkey" FOREIGN KEY ("created_by_id", "unit_id") REFERENCES "unit_members"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_unit_id_fkey" FOREIGN KEY ("project_id", "unit_id") REFERENCES "projects"("id", "unit_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_member_id_unit_id_fkey" FOREIGN KEY ("member_id", "unit_id") REFERENCES "unit_members"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_project_id_unit_id_fkey" FOREIGN KEY ("project_id", "unit_id") REFERENCES "projects"("id", "unit_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_curriculum_discipline_id_unit_id_fkey" FOREIGN KEY ("curriculum_discipline_id", "unit_id") REFERENCES "curriculum_disciplines"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_member_id_unit_id_fkey" FOREIGN KEY ("member_id", "unit_id") REFERENCES "unit_members"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_project_id_unit_id_fkey" FOREIGN KEY ("project_id", "unit_id") REFERENCES "projects"("id", "unit_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_timetable_id_unit_id_fkey" FOREIGN KEY ("timetable_id", "unit_id") REFERENCES "timetables"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_slots" ADD CONSTRAINT "board_slots_board_id_unit_id_fkey" FOREIGN KEY ("board_id", "unit_id") REFERENCES "boards"("id", "unit_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_slots" ADD CONSTRAINT "board_slots_time_slot_id_unit_id_fkey" FOREIGN KEY ("time_slot_id", "unit_id") REFERENCES "time_slots"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_slots" ADD CONSTRAINT "board_slots_offer_id_unit_id_fkey" FOREIGN KEY ("offer_id", "unit_id") REFERENCES "offers"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_slots" ADD CONSTRAINT "board_slots_location_id_unit_id_fkey" FOREIGN KEY ("location_id", "unit_id") REFERENCES "locations"("id", "unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;
