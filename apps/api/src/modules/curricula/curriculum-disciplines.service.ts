import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { CurriculumDiscipline, Prisma } from '@prisma/client'
import { withUniqueConflict } from '../../common/unique-violation'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement, assertMemberOrOwnership } from '../units/utils/permissions'
import { CurriculaService } from './curricula.service'
import { CreateCurriculumDisciplineInput } from './dto/create-curriculum-discipline.dto'
import { UpdateCurriculumDisciplineInput } from './dto/update-curriculum-discipline.dto'

const ALREADY_IN_CURRICULUM = 'This discipline is already in this curriculum'

const ITEM = {
  id: true,
  level: true,
  weeklyLessons: true,
  isRequired: true,
  discipline: { select: { id: true, name: true, code: true, workload: true, color: true } },
} satisfies Prisma.CurriculumDisciplineSelect

@Injectable()
export class CurriculumDisciplinesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly curricula: CurriculaService,
    private readonly audit: AuditService,
  ) {}

  // A grade sai agrupada por nível porque é assim que ela é lida: um bloco por
  // período, e não uma lista corrida de trinta disciplinas.
  async list(context: UnitContext, courseId: string, curriculumId: string) {
    assertMemberOrOwnership(context)

    await this.curricula.findInCourse(context, courseId, curriculumId)

    const items = await this.db.curriculumDiscipline.findMany({
      where: { curriculumId, unitId: context.unitId },
      select: ITEM,
      orderBy: [{ level: 'asc' }, { discipline: { name: 'asc' } }],
    })

    const levels = new Map<number, typeof items>()

    for (const item of items) {
      const level = levels.get(item.level) ?? []

      level.push(item)
      levels.set(item.level, level)
    }

    return [...levels].map(([level, disciplines]) => ({ level, items: disciplines }))
  }

  async create(
    context: UnitContext,
    courseId: string,
    curriculumId: string,
    input: CreateCurriculumDisciplineInput,
  ) {
    assertManagement(context)

    await this.curricula.findInCourse(context, courseId, curriculumId)
    await this.assertDisciplineInUnit(context, input.disciplineId)

    const item = await withUniqueConflict(ALREADY_IN_CURRICULUM, () =>
      this.db.curriculumDiscipline.create({
        data: { unitId: context.unitId, curriculumId, ...input },
        select: ITEM,
      }),
    )

    this.audit.record(
      AuditAction.CurriculumDisciplineAdded,
      { type: 'curriculum_discipline', id: item.id },
      { curriculumId, ...input },
    )

    return item
  }

  async update(
    context: UnitContext,
    courseId: string,
    curriculumId: string,
    itemId: string,
    input: UpdateCurriculumDisciplineInput,
  ) {
    assertManagement(context)

    await this.findInCurriculum(context, courseId, curriculumId, itemId)

    const item = await this.db.curriculumDiscipline.update({
      where: { id: itemId },
      data: input,
      select: ITEM,
    })

    this.audit.record(
      AuditAction.CurriculumDisciplineUpdated,
      { type: 'curriculum_discipline', id: itemId },
      { ...input },
    )

    return item
  }

  async remove(context: UnitContext, courseId: string, curriculumId: string, itemId: string) {
    assertManagement(context)

    await this.findInCurriculum(context, courseId, curriculumId, itemId)

    const offers = await this.db.offer.count({ where: { curriculumDisciplineId: itemId } })

    if (offers > 0) {
      throw new ConflictException('Cannot remove a discipline that already has offers')
    }

    await this.db.curriculumDiscipline.delete({ where: { id: itemId } })

    this.audit.record(AuditAction.CurriculumDisciplineRemoved, {
      type: 'curriculum_discipline',
      id: itemId,
    })
  }

  private async findInCurriculum(
    context: UnitContext,
    courseId: string,
    curriculumId: string,
    itemId: string,
  ): Promise<CurriculumDiscipline> {
    await this.curricula.findInCourse(context, courseId, curriculumId)

    const item = await this.db.curriculumDiscipline.findFirst({
      where: { id: itemId, curriculumId, unitId: context.unitId },
    })

    if (!item) throw new NotFoundException('Curriculum discipline not found')

    return item
  }

  // A FK composta recusaria disciplina de outra unidade de qualquer forma, mas
  // como erro de banco. Conferir antes troca isso por um 404 legível.
  private async assertDisciplineInUnit(context: UnitContext, disciplineId: string) {
    const discipline = await this.db.discipline.findFirst({
      where: { id: disciplineId, unitId: context.unitId },
      select: { id: true },
    })

    if (!discipline) throw new NotFoundException('Discipline not found')
  }
}
