import { Injectable } from '@nestjs/common'
import { Curriculum } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { CourseAccess, CourseAccessService } from '@modules/courses/course-access.service'

export type CurriculumAccess = CourseAccess & { curriculum: Curriculum }

/**
 * O currículo de um curso que o usuário enxerga, e se ele aceita escrita (spec 0012). O papel é o
 * do curso (`canManageCatalog`); quem chama decide se basta.
 */
@Injectable()
export class CurriculumAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly courses: CourseAccessService,
  ) {}

  /** Currículo de outro curso, inexistente ou com id fora do formato: 404. Não checa papel. */
  async resolveCurriculum(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    curriculumId: string,
  ): Promise<CurriculumAccess> {
    const access = await this.courses.resolveCourse(userId, orgSlug, unitSlug, courseId)

    const curriculum =
      z.cuid().safeParse(curriculumId).success &&
      (await this.database.curriculum.findFirst({
        where: { id: curriculumId, courseId: access.course.id },
      }))
    if (!curriculum) throw new AppException('CURRICULUM_NOT_FOUND')

    return { ...access, curriculum }
  }

  /**
   * O assertCatalogWritable do curso e, depois, o currículo ativo. Com `reactivating`, dispensa só
   * o 409 do currículo.
   */
  async assertCurriculumWritable(
    access: CurriculumAccess,
    { reactivating = false }: { reactivating?: boolean } = {},
  ): Promise<void> {
    await this.courses.assertCatalogWritable(access)
    if (!access.curriculum.isActive && !reactivating) {
      throw new AppException('CURRICULUM_INACTIVE')
    }
  }
}
