import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Curriculum } from '@prisma/client'
import { withUniqueConflict } from '../../common/unique-violation'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement, assertMemberOrOwnership } from '../units/utils/permissions'
import { CreateCurriculumInput } from './dto/create-curriculum.dto'
import { ListCurriculaQuery } from './dto/list-curricula.dto'
import { UpdateCurriculumInput } from './dto/update-curriculum.dto'

const NAME_TAKEN = 'A curriculum with this name already exists in this course'

@Injectable()
export class CurriculaService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(context: UnitContext, courseId: string, input: CreateCurriculumInput) {
    assertManagement(context)

    await this.assertCourseInUnit(context, courseId)

    const curriculum = await withUniqueConflict(NAME_TAKEN, () =>
      this.db.curriculum.create({ data: { unitId: context.unitId, courseId, ...input } }),
    )

    this.audit.record(
      AuditAction.CurriculumCreated,
      { type: 'curriculum', id: curriculum.id },
      { courseId, ...input },
    )

    return curriculum
  }

  async list(context: UnitContext, courseId: string, query: ListCurriculaQuery) {
    assertMemberOrOwnership(context)

    await this.assertCourseInUnit(context, courseId)

    const where = { unitId: context.unitId, courseId, isActive: query.active }

    const [items, total] = await this.db.$transaction([
      this.db.curriculum.findMany({
        where,
        orderBy: { name: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.curriculum.count({ where }),
    ])

    return { items, total, page: query.page, limit: query.limit }
  }

  async findOne(context: UnitContext, courseId: string, curriculumId: string) {
    assertMemberOrOwnership(context)

    return this.findInCourse(context, courseId, curriculumId)
  }

  async update(
    context: UnitContext,
    courseId: string,
    curriculumId: string,
    input: UpdateCurriculumInput,
  ) {
    assertManagement(context)

    await this.findInCourse(context, courseId, curriculumId)

    const curriculum = await withUniqueConflict(NAME_TAKEN, () =>
      this.db.curriculum.update({ where: { id: curriculumId }, data: input }),
    )

    this.audit.record(
      AuditAction.CurriculumUpdated,
      { type: 'curriculum', id: curriculum.id },
      { ...input },
    )

    return curriculum
  }

  // Projeto é a execução da grade num período: apagar o currículo apagaria o
  // chão de quem já rodou por ele. Aposentar é `isActive: false`.
  async remove(context: UnitContext, courseId: string, curriculumId: string) {
    assertManagement(context)

    await this.findInCourse(context, courseId, curriculumId)

    const projects = await this.db.project.count({ where: { curriculumId } })

    if (projects > 0) {
      throw new ConflictException('Cannot delete a curriculum that already has projects')
    }

    // Os itens da grade não têm vida própria fora do currículo: se nenhum
    // deles tem oferta, a grade inteira sai junto.
    const offers = await this.db.offer.count({
      where: { curriculumDiscipline: { curriculumId } },
    })

    if (offers > 0) {
      throw new ConflictException('Cannot delete a curriculum whose disciplines have offers')
    }

    await this.db.$transaction([
      this.db.curriculumDiscipline.deleteMany({ where: { curriculumId } }),
      this.db.curriculum.delete({ where: { id: curriculumId } }),
    ])

    this.audit.record(AuditAction.CurriculumDeleted, { type: 'curriculum', id: curriculumId })
  }

  // O par curso + unidade no where é o que impede alcançar currículo de outro
  // curso — ou de outra unidade — com um id válido de lá.
  async findInCourse(
    context: UnitContext,
    courseId: string,
    curriculumId: string,
  ): Promise<Curriculum> {
    const curriculum = await this.db.curriculum.findFirst({
      where: { id: curriculumId, courseId, unitId: context.unitId },
    })

    if (!curriculum) throw new NotFoundException('Curriculum not found')

    return curriculum
  }

  private async assertCourseInUnit(context: UnitContext, courseId: string) {
    const course = await this.db.course.findFirst({
      where: { id: courseId, unitId: context.unitId },
      select: { id: true },
    })

    if (!course) throw new NotFoundException('Course not found')
  }
}
