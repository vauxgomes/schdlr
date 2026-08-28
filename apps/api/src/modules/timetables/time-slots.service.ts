import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { TimeSlot } from '@prisma/client'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement, assertMemberOrOwnership } from '../units/utils/permissions'
import { CreateTimeSlotInput } from './dto/create-time-slot.dto'
import { UpdateTimeSlotInput } from './dto/update-time-slot.dto'
import { TimetablesService } from './timetables.service'
import { overlaps, Range } from './utils/overlap'

@Injectable()
export class TimeSlotsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly timetables: TimetablesService,
    private readonly audit: AuditService,
  ) {}

  async list(context: UnitContext, timetableId: string) {
    assertMemberOrOwnership(context)

    await this.timetables.findInUnit(context, timetableId)

    return this.db.timeSlot.findMany({
      where: { timetableId, unitId: context.unitId },
      orderBy: { startTime: 'asc' },
    })
  }

  async create(context: UnitContext, timetableId: string, input: CreateTimeSlotInput) {
    assertManagement(context)

    await this.timetables.findInUnit(context, timetableId)
    await this.assertFreeRange(context, timetableId, input)

    const slot = await this.db.timeSlot.create({
      data: { unitId: context.unitId, timetableId, ...input },
    })

    this.audit.record(
      AuditAction.TimeSlotCreated,
      { type: 'time_slot', id: slot.id },
      { timetableId, ...input },
    )

    return slot
  }

  async update(
    context: UnitContext,
    timetableId: string,
    slotId: string,
    input: UpdateTimeSlotInput,
  ) {
    assertManagement(context)

    const current = await this.findInTimetable(context, timetableId, slotId)
    const range = {
      startTime: input.startTime ?? current.startTime,
      endTime: input.endTime ?? current.endTime,
    }
    const moved = range.startTime !== current.startTime || range.endTime !== current.endTime

    if (moved) {
      // Remexer o horário de uma faixa já ocupada moveria aulas em quadros
      // montados sem que ninguém visse. Renomear e desativar continuam livres.
      const used = await this.db.boardSlot.count({ where: { timeSlotId: slotId } })

      if (used > 0) {
        throw new ConflictException('Cannot move a time slot that is used in a schedule')
      }

      if (range.endTime <= range.startTime) {
        throw new BadRequestException('endTime must be after startTime')
      }

      await this.assertFreeRange(context, timetableId, range, slotId)
    }

    const slot = await this.db.timeSlot.update({ where: { id: slotId }, data: input })

    this.audit.record(AuditAction.TimeSlotUpdated, { type: 'time_slot', id: slot.id }, { ...input })

    return slot
  }

  async remove(context: UnitContext, timetableId: string, slotId: string) {
    assertManagement(context)

    await this.findInTimetable(context, timetableId, slotId)

    const used = await this.db.boardSlot.count({ where: { timeSlotId: slotId } })

    if (used > 0) {
      throw new ConflictException('Cannot delete a time slot that is used in a schedule')
    }

    await this.db.timeSlot.delete({ where: { id: slotId } })

    this.audit.record(AuditAction.TimeSlotDeleted, { type: 'time_slot', id: slotId })
  }

  // Grades diferentes se sobrepõem à vontade — turnos que se tocam são o caso
  // normal. Dentro da mesma grade, não: duas aulas no mesmo minuto seriam duas
  // colunas para a mesma hora no quadro.
  private async assertFreeRange(
    context: UnitContext,
    timetableId: string,
    range: Range,
    exceptId?: string,
  ) {
    const siblings = await this.db.timeSlot.findMany({
      where: {
        timetableId,
        unitId: context.unitId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { startTime: true, endTime: true },
    })

    if (siblings.some((sibling) => overlaps(sibling, range))) {
      throw new ConflictException('This time slot overlaps another one in the same timetable')
    }
  }

  private async findInTimetable(
    context: UnitContext,
    timetableId: string,
    slotId: string,
  ): Promise<TimeSlot> {
    await this.timetables.findInUnit(context, timetableId)

    const slot = await this.db.timeSlot.findFirst({
      where: { id: slotId, timetableId, unitId: context.unitId },
    })

    if (!slot) throw new NotFoundException('Time slot not found')

    return slot
  }
}
