import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isUniqueViolation } from '@infra/database/prisma-errors'
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'

import { CourseAccessService, courseRoles } from './course-access.service'
import {
  CreateCourseInput,
  isCourseReactivation,
  UpdateCourseInput,
} from './schemas/course.schemas'

export type CourseView = {
  id: string
  name: string
  code: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  coordinator: { id: string; email: string; name: string } | null
  curriculaCount: number
  access: { canManageCourse: boolean; canManageCatalog: boolean }
}

const withDetails = {
  coordinator: { select: { id: true, email: true, name: true } },
  _count: { select: { curricula: true } },
} satisfies Prisma.CourseInclude

type CourseWithDetails = Prisma.CourseGetPayload<{ include: typeof withDetails }>

type Tx = Prisma.TransactionClient | DatabaseService

/** Dono e responsável gerenciam o curso; todo membro da unidade lê, inclusive os desativados. */
@Injectable()
export class CoursesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
    private readonly courses: CourseAccessService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async list(userId: string, orgSlug: string, unitSlug: string): Promise<CourseView[]> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const courses = await this.database.course.findMany({
      where: { unitId: access.unit.id },
      include: withDetails,
      orderBy: { name: 'asc' },
    })
    return courses.map((course) => toView(course, access, userId))
  }

  async get(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
  ): Promise<CourseView> {
    const access = await this.courses.resolveCourse(userId, orgSlug, unitSlug, courseId)
    const course = await this.database.course.findUniqueOrThrow({
      where: { id: access.course.id },
      include: withDetails,
    })
    return toView(course, access, userId)
  }

  /** A unidade fica travada (FOR UPDATE) da contagem até o create. */
  async create(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    { name, code, coordinatorId }: CreateCourseInput,
  ): Promise<CourseView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    if (!access.isOwner && !access.isManager) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    const { unit, organization } = access
    // assertWritable garante a assinatura do dono em vigor.
    const { coursesPerUnit: max } = (await this.subscriptions.getActivePlan(organization.ownerId))!
      .limits

    try {
      const course = await this.database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM units WHERE id = ${unit.id} FOR UPDATE`

        // Conta os desativados também (spec 0006).
        const count = await tx.course.count({ where: { unitId: unit.id } })
        if (max !== null && count >= max) {
          throw new AppException('PLAN_LIMIT_REACHED', { limit: 'coursesPerUnit', max })
        }

        await assertCoordinator(tx, unit.id, coordinatorId)
        await assertCodeFree(tx, unit.id, code)

        return tx.course.create({
          data: { name, code, coordinatorId, unitId: unit.id },
          include: withDetails,
        })
      })
      return toView(course, access, userId)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('COURSE_CODE_IN_USE')
      throw error
    }
  }

  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    body: UpdateCourseInput,
  ): Promise<CourseView> {
    const access = await this.courses.resolveCourse(userId, orgSlug, unitSlug, courseId)
    if (!access.canManageCourse) throw new AppException('NOT_ALLOWED')
    await this.courses.assertCatalogWritable(access, { reactivating: isCourseReactivation(body) })

    const { unit, course } = access
    await assertCoordinator(this.database, unit.id, body.coordinatorId)
    await assertCodeFree(this.database, unit.id, body.code, course.id)

    try {
      const updated = await this.database.course.update({
        where: { id: course.id },
        data: body,
        include: withDetails,
      })
      return toView(updated, access, userId)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('COURSE_CODE_IN_USE')
      throw error
    }
  }
}

/** Coordenador é membro da unidade, com ou sem flag; o dono também, só se for membro. */
async function assertCoordinator(tx: Tx, unitId: string, coordinatorId?: string | null) {
  if (!coordinatorId) return
  const member = await tx.unitMember.findUnique({
    where: { unitId_userId: { unitId, userId: coordinatorId } },
    select: { id: true },
  })
  if (!member) throw new AppException('COORDINATOR_NOT_A_MEMBER')
}

/** Código único na unidade quando presente; vários cursos sem código convivem. */
async function assertCodeFree(tx: Tx, unitId: string, code?: string | null, courseId?: string) {
  if (!code) return
  const taken = await tx.course.findUnique({
    where: { unitId_code: { unitId, code } },
    select: { id: true },
  })
  if (taken && taken.id !== courseId) throw new AppException('COURSE_CODE_IN_USE')
}

function toView(
  { id, name, code, isActive, createdAt, updatedAt, coordinator, _count }: CourseWithDetails,
  access: UnitAccess,
  userId: string,
): CourseView {
  const { canManageCourse, canManageCatalog } = courseRoles(access, coordinator?.id ?? null, userId)
  return {
    id,
    name,
    code,
    isActive,
    createdAt,
    updatedAt,
    coordinator,
    curriculaCount: _count.curricula,
    access: { canManageCourse, canManageCatalog },
  }
}
