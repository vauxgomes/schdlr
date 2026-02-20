import {
  DayOfWeek,
  MemberRole,
  PlanType,
  PrismaClient,
  ProviderType,
  TermStatus,
} from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ==========================================
  // Phase 1: Identity and Billing
  // ==========================================

  const user = await prisma.user.create({
    data: {
      email: 'admin@schdlr.com',
      name: 'System Admin',
      passwordHash: 'hashed_password_placeholder',
      identities: {
        create: {
          provider: ProviderType.CREDENTIALS,
          providerId: 'admin@schdlr.com',
        },
      },
    },
  })

  const account = await prisma.account.create({
    data: {
      name: 'Tech University Account',
      ownerId: user.id,
      subscription: {
        create: {
          plan: PlanType.PRO,
          isActive: true,
        },
      },
    },
  })

  // ==========================================
  // Phase 2: Multi-tenancy and Access Control
  // ==========================================

  const organization = await prisma.organization.create({
    data: {
      name: 'Main Campus',
      accountId: account.id,
    },
  })

  const member = await prisma.member.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      roles: [MemberRole.ADMIN, MemberRole.COORDINATOR, MemberRole.TEACHER],
    },
  })

  // ==========================================
  // Phase 3: Academic Catalog
  // ==========================================

  const course = await prisma.course.create({
    data: {
      name: 'Software Engineering',
      organizationId: organization.id,
    },
  })

  const curriculum = await prisma.curriculum.create({
    data: {
      name: '2026 Core Curriculum',
      courseId: course.id,
    },
  })

  const disciplineNode = await prisma.discipline.create({
    data: {
      name: 'Node.js & TypeScript Fundamentals',
      code: 'DEV101',
      workload: 60,
      color: '#339933',
      organizationId: organization.id,
    },
  })

  const disciplineCleanCode = await prisma.discipline.create({
    data: {
      name: 'Clean Code & OOP',
      code: 'DEV102',
      workload: 40,
      color: '#007acc',
      organizationId: organization.id,
    },
  })

  const currDiscNode = await prisma.curriculumDiscipline.create({
    data: {
      curriculumId: curriculum.id,
      disciplineId: disciplineNode.id,
      level: 1,
      isMandatory: true,
    },
  })

  await prisma.curriculumDiscipline.create({
    data: {
      curriculumId: curriculum.id,
      disciplineId: disciplineCleanCode.id,
      level: 1,
      isMandatory: true,
    },
  })

  // ==========================================
  // Phase 4: Infrastructure and Time
  // ==========================================

  const term = await prisma.term.create({
    data: {
      name: '2026.1',
      startDate: new Date('2026-02-01T00:00:00Z'),
      endDate: new Date('2026-06-30T23:59:59Z'),
      status: TermStatus.PLANNING,
      organizationId: organization.id,
    },
  })

  const location = await prisma.location.create({
    data: {
      name: 'Computer Lab A',
      capacity: 30,
      organizationId: organization.id,
    },
  })

  const timeSlotGroup = await prisma.timeSlotGroup.create({
    data: {
      name: 'Morning Shift',
      organizationId: organization.id,
    },
  })

  const timeSlot1 = await prisma.timeSlot.create({
    data: {
      name: 'M1',
      startTime: '08:00',
      endTime: '08:50',
      timeSlotGroupId: timeSlotGroup.id,
    },
  })

  const timeSlot2 = await prisma.timeSlot.create({
    data: {
      name: 'M2',
      startTime: '08:50',
      endTime: '09:40',
      timeSlotGroupId: timeSlotGroup.id,
    },
  })

  // ==========================================
  // Phase 5: Timetable Engine
  // ==========================================

  const timetable = await prisma.timetable.create({
    data: {
      name: 'Software Engineering - 1st Semester',
      termId: term.id,
      curriculumId: curriculum.id,
    },
  })

  const board = await prisma.board.create({
    data: {
      name: 'Main Visual Board',
      timetableId: timetable.id,
    },
  })

  const section = await prisma.section.create({
    data: {
      name: 'Class A - Morning',
      timetableId: timetable.id,
      curriculumDisciplineId: currDiscNode.id,
      memberId: member.id, // Assigned to our admin/teacher
    },
  })

  await prisma.slot.create({
    data: {
      boardId: board.id,
      sectionId: section.id,
      locationId: location.id,
      timeSlotId: timeSlot1.id,
      dayOfWeek: DayOfWeek.MONDAY,
    },
  })

  await prisma.slot.create({
    data: {
      boardId: board.id,
      sectionId: section.id,
      locationId: location.id,
      timeSlotId: timeSlot2.id,
      dayOfWeek: DayOfWeek.MONDAY,
    },
  })

  console.log('Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
