import { Injectable } from '@nestjs/common'
import { Course, Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isForeignKeyViolation, isUniqueViolation } from '@infra/database/prisma-errors'
import { CourseAccess, CourseAccessService } from '@modules/courses/course-access.service'

import { CurriculumAccessService } from './curriculum-access.service'
import {
  CreateCurriculumInput,
  isCurriculumReactivation,
  UpdateCurriculumInput,
} from './schemas/curriculum.schemas'

export type CurriculumView = {
  id: string
  name: string
  code: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  course: { id: string; name: string; code: string | null }
  subjectsCount: number
  totalWorkload: number
  inUse: boolean
  access: { canManageCatalog: boolean }
}

const withProjects = {
  _count: { select: { projects: true } },
} satisfies Prisma.CurriculumInclude

type CurriculumWithProjects = Prisma.CurriculumGetPayload<{ include: typeof withProjects }>

type Grade = { subjectsCount: number; totalWorkload: number }

/** Escreve quem gerencia o catálogo do curso; lê quem enxerga a unidade, inclusive o desativado. */
@Injectable()
export class CurriculaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly courses: CourseAccessService,
    private readonly curricula: CurriculumAccessService,
  ) {}

  /** Mais novos primeiro: as matrizes recentes costumam ter o código maior. */
  async list(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
  ): Promise<CurriculumView[]> {
    const access = await this.courses.resolveCourse(userId, orgSlug, unitSlug, courseId)
    const curricula = await this.database.curriculum.findMany({
      where: { courseId: access.course.id },
      include: withProjects,
      orderBy: { code: 'desc' },
    })
    const grades = await this.grades(curricula.map(({ id }) => id))
    return curricula.map((curriculum) => toView(curriculum, access, grades.get(curriculum.id)))
  }

  async get(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    curriculumId: string,
  ): Promise<CurriculumView> {
    const access = await this.curricula.resolveCurriculum(
      userId,
      orgSlug,
      unitSlug,
      courseId,
      curriculumId,
    )
    return this.view(access.curriculum.id, access)
  }

  async create(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    { name, code, description }: CreateCurriculumInput,
  ): Promise<CurriculumView> {
    const access = await this.courses.resolveCourse(userId, orgSlug, unitSlug, courseId)
    if (!access.canManageCatalog) throw new AppException('NOT_ALLOWED')
    // Curso desativado não recebe currículo novo.
    await this.courses.assertCatalogWritable(access)
    await this.assertCodeFree(access.course.id, code)

    try {
      const curriculum = await this.database.curriculum.create({
        data: { name, code, description, courseId: access.course.id },
        include: withProjects,
      })
      return toView(curriculum, access, undefined)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('CURRICULUM_CODE_IN_USE')
      throw error
    }
  }

  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    curriculumId: string,
    body: UpdateCurriculumInput,
  ): Promise<CurriculumView> {
    const access = await this.curricula.resolveCurriculum(
      userId,
      orgSlug,
      unitSlug,
      courseId,
      curriculumId,
    )
    if (!access.canManageCatalog) throw new AppException('NOT_ALLOWED')
    await this.curricula.assertCurriculumWritable(access, {
      reactivating: isCurriculumReactivation(body),
    })

    const { course, curriculum } = access
    if (body.code) await this.assertCodeFree(course.id, body.code, curriculum.id)

    try {
      await this.database.curriculum.update({ where: { id: curriculum.id }, data: body })
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('CURRICULUM_CODE_IN_USE')
      throw error
    }
    return this.view(curriculum.id, access)
  }

  /**
   * Apaga o currículo e, em cascata, as disciplinas dele, enquanto nenhum projeto o usa. Passa pelo
   * assertCatalogWritable do curso, não pelo do currículo: desativado e sem uso também sai.
   */
  async remove(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    curriculumId: string,
  ): Promise<void> {
    const access = await this.curricula.resolveCurriculum(
      userId,
      orgSlug,
      unitSlug,
      courseId,
      curriculumId,
    )
    if (!access.canManageCatalog) throw new AppException('NOT_ALLOWED')
    await this.courses.assertCatalogWritable(access)

    const { id } = access.curriculum
    const projects = await this.database.project.count({ where: { curriculumId: id } })
    if (projects > 0) throw new AppException('CURRICULUM_IN_USE')

    try {
      await this.database.curriculum.delete({ where: { id } })
    } catch (error) {
      // Um projeto criado entre a contagem e o delete: o Restrict de Project.curriculumId barra.
      if (isForeignKeyViolation(error)) throw new AppException('CURRICULUM_IN_USE')
      throw error
    }
  }

  private async view(curriculumId: string, access: CourseAccess): Promise<CurriculumView> {
    const curriculum = await this.database.curriculum.findUniqueOrThrow({
      where: { id: curriculumId },
      include: withProjects,
    })
    const grades = await this.grades([curriculumId])
    return toView(curriculum, access, grades.get(curriculumId))
  }

  /** A grade que vale: só as disciplinas ativas contam. */
  private async grades(curriculumIds: string[]): Promise<Map<string, Grade>> {
    if (curriculumIds.length === 0) return new Map()
    const rows = await this.database.subject.groupBy({
      by: ['curriculumId'],
      where: { curriculumId: { in: curriculumIds }, isActive: true },
      _count: { _all: true },
      _sum: { workload: true },
    })
    return new Map(
      rows.map(({ curriculumId, _count, _sum }) => [
        curriculumId,
        { subjectsCount: _count._all, totalWorkload: _sum.workload ?? 0 },
      ]),
    )
  }

  /** Código único no curso. */
  private async assertCodeFree(courseId: string, code: string, curriculumId?: string) {
    const taken = await this.database.curriculum.findUnique({
      where: { courseId_code: { courseId, code } },
      select: { id: true },
    })
    if (taken && taken.id !== curriculumId) throw new AppException('CURRICULUM_CODE_IN_USE')
  }
}

function toView(
  { id, name, code, description, isActive, createdAt, updatedAt, _count }: CurriculumWithProjects,
  { course, canManageCatalog }: { course: Course; canManageCatalog: boolean },
  grade: Grade | undefined,
): CurriculumView {
  return {
    id,
    name,
    code,
    description,
    isActive,
    createdAt,
    updatedAt,
    course: { id: course.id, name: course.name, code: course.code },
    subjectsCount: grade?.subjectsCount ?? 0,
    totalWorkload: grade?.totalWorkload ?? 0,
    inUse: _count.projects > 0,
    access: { canManageCatalog },
  }
}
