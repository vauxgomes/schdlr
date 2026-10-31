import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isForeignKeyViolation, isUniqueViolation } from '@infra/database/prisma-errors'
import {
  CurriculumAccess,
  CurriculumAccessService,
} from '@modules/curricula/curriculum-access.service'

import {
  CreateSubjectInput,
  isSubjectReactivation,
  UpdateSubjectInput,
} from './schemas/subject.schemas'

export type SubjectView = {
  id: string
  name: string
  code: string
  workload: number
  level: number
  color: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  inUse: boolean
}

const withOfferings = {
  _count: { select: { offerings: true } },
} satisfies Prisma.SubjectInclude

type SubjectWithOfferings = Prisma.SubjectGetPayload<{ include: typeof withOfferings }>

/**
 * A grade de um currículo (spec 0013). Escreve quem gerencia o catálogo do curso, sempre com o
 * currículo ativo; lê quem enxerga a unidade, inclusive o desativado.
 */
@Injectable()
export class SubjectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly curricula: CurriculumAccessService,
  ) {}

  /** A grade inteira, por nível e código. */
  async list(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    curriculumId: string,
  ): Promise<SubjectView[]> {
    const { curriculum } = await this.curricula.resolveCurriculum(
      userId,
      orgSlug,
      unitSlug,
      courseId,
      curriculumId,
    )
    const subjects = await this.database.subject.findMany({
      where: { curriculumId: curriculum.id },
      include: withOfferings,
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
    })
    return subjects.map(toView)
  }

  async get(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    curriculumId: string,
    subjectId: string,
  ): Promise<SubjectView> {
    const access = await this.curricula.resolveCurriculum(
      userId,
      orgSlug,
      unitSlug,
      courseId,
      curriculumId,
    )
    return toView(await this.findSubject(access, subjectId))
  }

  async create(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    curriculumId: string,
    body: CreateSubjectInput,
  ): Promise<SubjectView> {
    const access = await this.curricula.resolveCurriculum(
      userId,
      orgSlug,
      unitSlug,
      courseId,
      curriculumId,
    )
    if (!access.canManageCatalog) throw new AppException('NOT_ALLOWED')
    await this.curricula.assertCurriculumWritable(access)

    const { curriculum } = access
    await this.assertCodeFree(curriculum.id, body.code)

    try {
      const subject = await this.database.subject.create({
        data: { ...body, curriculumId: curriculum.id },
        include: withOfferings,
      })
      return toView(subject)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('SUBJECT_CODE_IN_USE')
      throw error
    }
  }

  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    curriculumId: string,
    subjectId: string,
    body: UpdateSubjectInput,
  ): Promise<SubjectView> {
    const access = await this.curricula.resolveCurriculum(
      userId,
      orgSlug,
      unitSlug,
      courseId,
      curriculumId,
    )
    const subject = await this.findSubject(access, subjectId)
    if (!access.canManageCatalog) throw new AppException('NOT_ALLOWED')
    await this.curricula.assertCurriculumWritable(access)
    if (!subject.isActive && !isSubjectReactivation(body)) {
      throw new AppException('SUBJECT_INACTIVE')
    }

    if (body.code) await this.assertCodeFree(access.curriculum.id, body.code, subject.id)

    try {
      const updated = await this.database.subject.update({
        where: { id: subject.id },
        data: body,
        include: withOfferings,
      })
      return toView(updated)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('SUBJECT_CODE_IN_USE')
      throw error
    }
  }

  /** Apaga enquanto nenhuma oferta a usa; desativada e sem uso também sai. */
  async remove(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    courseId: string,
    curriculumId: string,
    subjectId: string,
  ): Promise<void> {
    const access = await this.curricula.resolveCurriculum(
      userId,
      orgSlug,
      unitSlug,
      courseId,
      curriculumId,
    )
    const subject = await this.findSubject(access, subjectId)
    if (!access.canManageCatalog) throw new AppException('NOT_ALLOWED')
    await this.curricula.assertCurriculumWritable(access)

    if (subject._count.offerings > 0) throw new AppException('SUBJECT_IN_USE')

    try {
      await this.database.subject.delete({ where: { id: subject.id } })
    } catch (error) {
      // Uma oferta criada entre a leitura e o delete: o Restrict de Offering.subjectId barra.
      if (isForeignKeyViolation(error)) throw new AppException('SUBJECT_IN_USE')
      throw error
    }
  }

  /** Disciplina de outro currículo, inexistente ou com id fora do formato: 404. */
  private async findSubject({ curriculum }: CurriculumAccess, subjectId: string) {
    const subject =
      z.cuid().safeParse(subjectId).success &&
      (await this.database.subject.findFirst({
        where: { id: subjectId, curriculumId: curriculum.id },
        include: withOfferings,
      }))
    if (!subject) throw new AppException('SUBJECT_NOT_FOUND')
    return subject
  }

  /** Código único no currículo. */
  private async assertCodeFree(curriculumId: string, code: string, subjectId?: string) {
    const taken = await this.database.subject.findUnique({
      where: { curriculumId_code: { curriculumId, code } },
      select: { id: true },
    })
    if (taken && taken.id !== subjectId) throw new AppException('SUBJECT_CODE_IN_USE')
  }
}

function toView({
  id,
  name,
  code,
  workload,
  level,
  color,
  isActive,
  createdAt,
  updatedAt,
  _count,
}: SubjectWithOfferings): SubjectView {
  return {
    id,
    name,
    code,
    workload,
    level,
    color,
    isActive,
    createdAt,
    updatedAt,
    inUse: _count.offerings > 0,
  }
}
