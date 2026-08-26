import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Discipline } from '@prisma/client'
import { withUniqueConflict } from '../../common/unique-violation'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement, assertMemberOrOwnership } from '../units/utils/permissions'
import { CreateDisciplineInput } from './dto/create-discipline.dto'
import { ListDisciplinesQuery } from './dto/list-disciplines.dto'
import { UpdateDisciplineInput } from './dto/update-discipline.dto'

const CODE_TAKEN = 'A discipline with this code already exists in this unit'

@Injectable()
export class DisciplinesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(context: UnitContext, input: CreateDisciplineInput) {
    assertManagement(context)

    const discipline = await withUniqueConflict(CODE_TAKEN, () =>
      this.db.discipline.create({ data: { unitId: context.unitId, ...input } }),
    )

    this.audit.record(
      AuditAction.DisciplineCreated,
      { type: 'discipline', id: discipline.id },
      { ...input },
    )

    return discipline
  }

  async list(context: UnitContext, query: ListDisciplinesQuery) {
    assertMemberOrOwnership(context)

    const where = { unitId: context.unitId, isActive: query.active }

    const [items, total] = await this.db.$transaction([
      this.db.discipline.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.discipline.count({ where }),
    ])

    return { items, total, page: query.page, limit: query.limit }
  }

  // A cor vem junto: quem monta o quadro pinta a disciplina escolhida, e uma
  // segunda consulta só para isso não se justifica.
  select(context: UnitContext) {
    assertMemberOrOwnership(context)

    return this.db.discipline.findMany({
      where: { unitId: context.unitId, isActive: true },
      select: { id: true, name: true, code: true, color: true },
      orderBy: { name: 'asc' },
    })
  }

  findOne(context: UnitContext, disciplineId: string) {
    assertMemberOrOwnership(context)

    return this.findInUnit(context, disciplineId)
  }

  async update(context: UnitContext, disciplineId: string, input: UpdateDisciplineInput) {
    assertManagement(context)

    await this.findInUnit(context, disciplineId)

    const discipline = await withUniqueConflict(CODE_TAKEN, () =>
      this.db.discipline.update({ where: { id: disciplineId }, data: input }),
    )

    this.audit.record(
      AuditAction.DisciplineUpdated,
      { type: 'discipline', id: discipline.id },
      { ...input },
    )

    return discipline
  }

  async remove(context: UnitContext, disciplineId: string) {
    assertManagement(context)

    await this.findInUnit(context, disciplineId)

    const items = await this.db.curriculumDiscipline.count({ where: { disciplineId } })

    if (items > 0) {
      throw new ConflictException('Cannot delete a discipline that belongs to a curriculum')
    }

    await this.db.discipline.delete({ where: { id: disciplineId } })

    this.audit.record(AuditAction.DisciplineDeleted, { type: 'discipline', id: disciplineId })
  }

  private async findInUnit(context: UnitContext, disciplineId: string): Promise<Discipline> {
    const discipline = await this.db.discipline.findFirst({
      where: { id: disciplineId, unitId: context.unitId },
    })

    if (!discipline) throw new NotFoundException('Discipline not found')

    return discipline
  }
}
