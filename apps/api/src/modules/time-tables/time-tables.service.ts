import { Injectable } from '@nestjs/common'
import { Prisma, Unit } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isForeignKeyViolation, isUniqueViolation } from '@infra/database/prisma-errors'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'
import { toHHMM, toMinutes } from '@modules/time-slots/time'

import {
  CreateTimeTableInput,
  DuplicateTimeTableInput,
  isTimeTableReactivation,
  UpdateTimeTableInput,
} from './schemas/time-table.schemas'

export type TimeSlotView = {
  id: string
  name: string
  startTime: string
  endTime: string
  inUse: boolean
}

export type TimeTableView = {
  id: string
  name: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  slots: TimeSlotView[]
  boardsCount: number
  access: { canManage: boolean }
}

const withSlots = {
  slots: { include: { _count: { select: { boardSlots: true } } }, orderBy: { startTime: 'asc' } },
  _count: { select: { boards: true } },
} satisfies Prisma.TimeTableInclude

type TimeTableWithSlots = Prisma.TimeTableGetPayload<{ include: typeof withSlots }>

/** Dono e responsável gerenciam blocos e horários; todo membro da unidade lê. */
export const canManageTimeTables = (access: UnitAccess) => access.isOwner || access.isManager

/**
 * Blocos de horários da unidade (spec 0017): recurso compartilhado entre os cursos, como o local.
 * Os horários de cada bloco moram em `time-slots/`, que usa `findInUnit` e `view` daqui.
 */
@Injectable()
export class TimeTablesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
  ) {}

  async list(userId: string, orgSlug: string, unitSlug: string): Promise<TimeTableView[]> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const timeTables = await this.database.timeTable.findMany({
      where: { unitId: access.unit.id },
      include: withSlots,
      orderBy: { name: 'asc' },
    })
    return timeTables.map((timeTable) => toView(timeTable, access))
  }

  async get(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    timeTableId: string,
  ): Promise<TimeTableView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const { id } = await this.findInUnit(access.unit, timeTableId)
    return this.view(id, access)
  }

  /** Com ou sem horários, numa operação só: ou vai tudo, ou nada. */
  async create(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    { name, slots }: CreateTimeTableInput,
  ): Promise<TimeTableView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    if (!canManageTimeTables(access)) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)
    await this.assertNameFree(access.unit.id, name)
    assertSlotNamesUnique(slots.map((slot) => slot.name))

    const data = slots.map(({ name, startTime, endTime }) => ({
      name,
      startTime: toMinutes(startTime),
      endTime: toMinutes(endTime),
    }))
    return this.createWithSlots(access, name, data)
  }

  /** Nome e isActive; os horários têm rotas próprias. */
  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    timeTableId: string,
    body: UpdateTimeTableInput,
  ): Promise<TimeTableView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const timeTable = await this.findInUnit(access.unit, timeTableId)
    if (!canManageTimeTables(access)) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)
    if (!timeTable.isActive && !isTimeTableReactivation(body)) {
      throw new AppException('TIME_TABLE_INACTIVE')
    }
    if (body.name) await this.assertNameFree(access.unit.id, body.name, timeTable.id)

    try {
      await this.database.timeTable.update({ where: { id: timeTable.id }, data: body })
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('TIME_TABLE_NAME_IN_USE')
      throw error
    }
    return this.view(timeTable.id, access)
  }

  /** Apaga o bloco e, em cascata, os horários, enquanto nenhum quadro o usa. */
  async remove(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    timeTableId: string,
  ): Promise<void> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const timeTable = await this.findInUnit(access.unit, timeTableId)
    if (!canManageTimeTables(access)) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    const boards = await this.database.board.count({ where: { timeTableId: timeTable.id } })
    if (boards > 0) throw new AppException('TIME_TABLE_IN_USE')

    try {
      await this.database.timeTable.delete({ where: { id: timeTable.id } })
    } catch (error) {
      // Um quadro criado entre a contagem e o delete: o Restrict de Board.timeTableId barra.
      if (isForeignKeyViolation(error)) throw new AppException('TIME_TABLE_IN_USE')
      throw error
    }
  }

  /** Bloco novo e ativo com a cópia dos horários; a origem pode estar desativada. */
  async duplicate(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    timeTableId: string,
    { name }: DuplicateTimeTableInput,
  ): Promise<TimeTableView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const source = await this.findInUnit(access.unit, timeTableId)
    if (!canManageTimeTables(access)) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)
    await this.assertNameFree(access.unit.id, name)

    const slots = await this.database.timeSlot.findMany({
      where: { timeTableId: source.id },
      select: { name: true, startTime: true, endTime: true },
    })
    return this.createWithSlots(access, name, slots)
  }

  /** Bloco de outra unidade, inexistente ou com id fora do formato: 404. */
  async findInUnit(unit: Unit, timeTableId: string) {
    const timeTable =
      z.cuid().safeParse(timeTableId).success &&
      (await this.database.timeTable.findFirst({ where: { id: timeTableId, unitId: unit.id } }))
    if (!timeTable) throw new AppException('TIME_TABLE_NOT_FOUND')
    return timeTable
  }

  /** O bloco inteiro, com os horários por início. */
  async view(timeTableId: string, access: UnitAccess): Promise<TimeTableView> {
    const timeTable = await this.database.timeTable.findUniqueOrThrow({
      where: { id: timeTableId },
      include: withSlots,
    })
    return toView(timeTable, access)
  }

  private async createWithSlots(
    access: UnitAccess,
    name: string,
    slots: { name: string; startTime: number; endTime: number }[],
  ): Promise<TimeTableView> {
    try {
      const timeTable = await this.database.timeTable.create({
        data: { name, unitId: access.unit.id, slots: { create: slots } },
        include: withSlots,
      })
      return toView(timeTable, access)
    } catch (error) {
      // Os nomes dos horários já foram conferidos: o repetido em corrida é o do bloco.
      if (isUniqueViolation(error)) throw new AppException('TIME_TABLE_NAME_IN_USE')
      throw error
    }
  }

  /** Nome único na unidade. */
  private async assertNameFree(unitId: string, name: string, timeTableId?: string) {
    const taken = await this.database.timeTable.findUnique({
      where: { unitId_name: { unitId, name } },
      select: { id: true },
    })
    if (taken && taken.id !== timeTableId) throw new AppException('TIME_TABLE_NAME_IN_USE')
  }
}

/** Nome repetido na lista do POST é o mesmo 409 do nome repetido no bloco. */
function assertSlotNamesUnique(names: string[]) {
  if (new Set(names).size !== names.length) throw new AppException('TIME_SLOT_NAME_IN_USE')
}

function toView(
  { id, name, isActive, createdAt, updatedAt, slots, _count }: TimeTableWithSlots,
  access: UnitAccess,
): TimeTableView {
  return {
    id,
    name,
    isActive,
    createdAt,
    updatedAt,
    slots: slots.map((slot) => ({
      id: slot.id,
      name: slot.name,
      startTime: toHHMM(slot.startTime),
      endTime: toHHMM(slot.endTime),
      inUse: slot._count.boardSlots > 0,
    })),
    boardsCount: _count.boards,
    access: { canManage: canManageTimeTables(access) },
  }
}
