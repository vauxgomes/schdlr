import { Injectable } from '@nestjs/common'
import { Course } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'

export type CourseRoles = {
  isCoordinator: boolean // course.coordinatorId === userId
  canManageCourse: boolean // dono ou responsável
  canManageCatalog: boolean // dono, responsável ou coordenador do curso
}

export type CourseAccess = UnitAccess & CourseRoles & { course: Course }

/** O papel de quem chamou num curso da unidade que ele enxerga. */
export function courseRoles(
  access: UnitAccess,
  coordinatorId: string | null,
  userId: string,
): CourseRoles {
  const isCoordinator = coordinatorId === userId
  const canManageCourse = access.isOwner || access.isManager
  return { isCoordinator, canManageCourse, canManageCatalog: canManageCourse || isCoordinator }
}

/**
 * Quem é o usuário num curso, e se o catálogo dele aceita escrita (spec 0011). Ler é de quem
 * enxerga a unidade; o papel é lido do banco a cada requisição e quem chama decide se basta.
 */
@Injectable()
export class CourseAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
  ) {}

  /** Curso de outra unidade, inexistente ou com id fora do formato: 404. Não checa papel. */
  async resolveCourse(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
  ): Promise<CourseAccess> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)

    const course =
      z.cuid().safeParse(courseId).success &&
      (await this.database.course.findFirst({ where: { id: courseId, unitId: access.unit.id } }))
    if (!course) throw new AppException('COURSE_NOT_FOUND')

    return { ...access, course, ...courseRoles(access, course.coordinatorId, userId) }
  }

  /**
   * O assertWritable da unidade e, depois, o curso ativo. Com `reactivating`, dispensa só o 409
   * do curso.
   */
  async assertCatalogWritable(
    access: CourseAccess,
    { reactivating = false }: { reactivating?: boolean } = {},
  ): Promise<void> {
    await this.tenants.assertWritable(access)
    if (!access.course.isActive && !reactivating) throw new AppException('COURSE_INACTIVE')
  }
}
