import { Injectable } from '@nestjs/common'
import { Prisma, TimeSlot } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isForeignKeyViolation, isUniqueViolation } from '@infra/database/prisma-errors'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'
import { MAX_SLOTS } from '@modules/time-tables/schemas/time-table.schemas'
import {
  canManageTimeTables,
  TimeTablesService,
  TimeTableView,
} from '@modules/time-tables/time-tables.service'

import {
  CreateTimeSlotInput,
  END_NOT_AFTER_START,
  UpdateTimeSlotInput,
} from './schemas/time-slot.schemas'
import { Interval, overlaps, toHHMM, toMinutes } from './time'

type Slot = Interval & { name: string }

/**
 * Horários de um bloco (spec 0017). Criar e editar rodam numa transação com o bloco travado, que lê
 * os horários dele antes de gravar: duas gravações simultâneas no mesmo bloco não passam as duas.
 * Respondem com o bloco inteiro.
 */
@Injectable()
export class TimeSlotsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
    private readonly timeTables: TimeTablesService,
  ) {}

  async create(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    timeTableId: string,
    { name, startTime, endTime }: CreateTimeSlotInput,
  ): Promise<TimeTableView> {
    const { access, timeTable } = await this.resolveWritable(userId, orgSlug, unitSlug, timeTableId)
    const slot = { name, startTime: toMinutes(startTime), endTime: toMinutes(endTime) }

    try {
      await this.database.$transaction(async (tx) => {
        const others = await lockAndReadSlots(tx, timeTable.id)
        if (others.length >= MAX_SLOTS) {
          throw new AppException('TIME_TABLE_FULL', { max: MAX_SLOTS })
        }
        assertFits(slot, others)
        await tx.timeSlot.create({ data: { ...slot, timeTableId: timeTable.id } })
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('TIME_SLOT_NAME_IN_USE')
      throw error
    }
    return this.timeTables.view(timeTable.id, access)
  }

  /**
   * As regras de hora valem para o resultado (o valor novo contra o que fica). Horário com célula
   * não muda de hora; renomear passa.
   */
  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    timeTableId: string,
    slotId: string,
    body: UpdateTimeSlotInput,
  ): Promise<TimeTableView> {
    const { access, timeTable } = await this.resolveWritable(userId, orgSlug, unitSlug, timeTableId)
    const current = await this.findSlot(timeTable.id, slotId)

    const slot = {
      name: body.name ?? current.name,
      startTime: body.startTime ? toMinutes(body.startTime) : current.startTime,
      endTime: body.endTime ? toMinutes(body.endTime) : current.endTime,
    }
    if (slot.endTime <= slot.startTime) {
      throw new AppException('VALIDATION_FAILED', undefined, [{ ...END_NOT_AFTER_START }])
    }
    const changesTime = slot.startTime !== current.startTime || slot.endTime !== current.endTime
    if (changesTime && current._count.boardSlots > 0) {
      throw new AppException('TIME_SLOT_IN_USE')
    }

    try {
      await this.database.$transaction(async (tx) => {
        const others = await lockAndReadSlots(tx, timeTable.id, current.id)
        assertFits(slot, others)
        await tx.timeSlot.update({ where: { id: current.id }, data: slot })
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('TIME_SLOT_NAME_IN_USE')
      throw error
    }
    return this.timeTables.view(timeTable.id, access)
  }

  /** Apaga enquanto nenhuma célula o usa. */
  async remove(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    timeTableId: string,
    slotId: string,
  ): Promise<void> {
    const { timeTable } = await this.resolveWritable(userId, orgSlug, unitSlug, timeTableId)
    const slot = await this.findSlot(timeTable.id, slotId)
    if (slot._count.boardSlots > 0) throw new AppException('TIME_SLOT_IN_USE')

    try {
      await this.database.timeSlot.delete({ where: { id: slot.id } })
    } catch (error) {
      // Uma célula criada entre a leitura e o delete: o Restrict de BoardSlot.timeSlotId barra.
      if (isForeignKeyViolation(error)) throw new AppException('TIME_SLOT_IN_USE')
      throw error
    }
  }

  /** Bloco (404) → papel (403) → assertWritable → bloco ativo (409). */
  private async resolveWritable(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    timeTableId: string,
  ): Promise<{ access: UnitAccess; timeTable: { id: string } }> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const timeTable = await this.timeTables.findInUnit(access.unit, timeTableId)
    if (!canManageTimeTables(access)) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)
    if (!timeTable.isActive) throw new AppException('TIME_TABLE_INACTIVE')
    return { access, timeTable }
  }

  /** Horário de outro bloco, inexistente ou com id fora do formato: 404. */
  private async findSlot(timeTableId: string, slotId: string) {
    const slot =
      z.cuid().safeParse(slotId).success &&
      (await this.database.timeSlot.findFirst({
        where: { id: slotId, timeTableId },
        include: { _count: { select: { boardSlots: true } } },
      }))
    if (!slot) throw new AppException('TIME_SLOT_NOT_FOUND')
    return slot
  }
}

/** Trava o bloco e lê os outros horários dele, por início. */
async function lockAndReadSlots(
  tx: Prisma.TransactionClient,
  timeTableId: string,
  exceptId?: string,
): Promise<TimeSlot[]> {
  await tx.$queryRaw`SELECT id FROM time_tables WHERE id = ${timeTableId} FOR UPDATE`
  return tx.timeSlot.findMany({
    where: { timeTableId, ...(exceptId && { id: { not: exceptId } }) },
    orderBy: { startTime: 'asc' },
  })
}

/** Nome único no bloco e sem sobreposição com os outros horários dele. */
function assertFits(slot: Slot, others: TimeSlot[]) {
  if (others.some((other) => other.name === slot.name)) {
    throw new AppException('TIME_SLOT_NAME_IN_USE')
  }
  const clash = others.find((other) => overlaps(other, slot))
  if (clash) {
    throw new AppException('TIME_SLOT_OVERLAP', {
      slotId: clash.id,
      name: clash.name,
      startTime: toHHMM(clash.startTime),
      endTime: toHHMM(clash.endTime),
    })
  }
}
