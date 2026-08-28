import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, Timetable } from '@prisma/client'
import { withUniqueConflict } from '../../common/unique-violation'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement, assertMemberOrOwnership } from '../units/utils/permissions'
import { CreateTimetableInput } from './dto/create-timetable.dto'
import { ListTimetablesQuery, SelectTimetablesQuery } from './dto/list-timetables.dto'
import { UpdateTimetableInput } from './dto/update-timetable.dto'

const NAME_TAKEN = 'A timetable with this name already exists in this unit'

const SLOTS = {
  select: { id: true, name: true, startTime: true, endTime: true },
  where: { isActive: true },
  orderBy: { startTime: 'asc' },
} satisfies Prisma.Timetable$timeSlotsArgs

@Injectable()
export class TimetablesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(context: UnitContext, input: CreateTimetableInput) {
    assertManagement(context)

    const timetable = await withUniqueConflict(NAME_TAKEN, () =>
      this.db.timetable.create({ data: { unitId: context.unitId, ...input } }),
    )

    this.audit.record(
      AuditAction.TimetableCreated,
      { type: 'timetable', id: timetable.id },
      { ...input },
    )

    return timetable
  }

  async list(context: UnitContext, query: ListTimetablesQuery) {
    assertMemberOrOwnership(context)

    const where = { unitId: context.unitId, isActive: query.active }

    const [items, total] = await this.db.$transaction([
      this.db.timetable.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.timetable.count({ where }),
    ])

    return { items, total, page: query.page, limit: query.limit }
  }

  // As faixas vêm junto só quando pedidas: quem está montando um combo quer
  // três nomes, quem está desenhando o quadro quer a grade inteira.
  select(context: UnitContext, query: SelectTimetablesQuery) {
    assertMemberOrOwnership(context)

    return this.db.timetable.findMany({
      where: { unitId: context.unitId, isActive: true },
      select: { id: true, name: true, ...(query.withSlots ? { timeSlots: SLOTS } : {}) },
      orderBy: { name: 'asc' },
    })
  }

  async findOne(context: UnitContext, timetableId: string) {
    assertMemberOrOwnership(context)

    await this.findInUnit(context, timetableId)

    return this.db.timetable.findUniqueOrThrow({
      where: { id: timetableId },
      include: { timeSlots: { orderBy: { startTime: 'asc' } } },
    })
  }

  async update(context: UnitContext, timetableId: string, input: UpdateTimetableInput) {
    assertManagement(context)

    await this.findInUnit(context, timetableId)

    const timetable = await withUniqueConflict(NAME_TAKEN, () =>
      this.db.timetable.update({ where: { id: timetableId }, data: input }),
    )

    this.audit.record(
      AuditAction.TimetableUpdated,
      { type: 'timetable', id: timetable.id },
      { ...input },
    )

    return timetable
  }

  // As faixas saem junto com a grade, como a grade do currículo sai junto com
  // ele: faixa não tem vida própria. O que barra a exclusão é uso — turma
  // montada sobre a grade, ou faixa já ocupada num quadro.
  async remove(context: UnitContext, timetableId: string) {
    assertManagement(context)

    await this.findInUnit(context, timetableId)

    const boards = await this.db.board.count({ where: { timetableId } })

    if (boards > 0) {
      throw new ConflictException('Cannot delete a timetable that is used by a board')
    }

    const slots = await this.db.boardSlot.count({ where: { timeSlot: { timetableId } } })

    if (slots > 0) {
      throw new ConflictException('Cannot delete a timetable whose slots are used in a schedule')
    }

    await this.db.$transaction([
      this.db.timeSlot.deleteMany({ where: { timetableId } }),
      this.db.timetable.delete({ where: { id: timetableId } }),
    ])

    this.audit.record(AuditAction.TimetableDeleted, { type: 'timetable', id: timetableId })
  }

  async findInUnit(context: UnitContext, timetableId: string): Promise<Timetable> {
    const timetable = await this.db.timetable.findFirst({
      where: { id: timetableId, unitId: context.unitId },
    })

    if (!timetable) throw new NotFoundException('Timetable not found')

    return timetable
  }
}
