import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isUniqueViolation } from '@infra/database/prisma-errors'
import {
  CellView,
  emptyCell,
  toCellView,
  withCellDetails,
} from '@modules/board-slots/board-slot-view'
import { ProjectAccess, ProjectAccessService } from '@modules/projects/project-access.service'
import { toHHMM } from '@modules/time-slots/time'
import { TimeTablesService } from '@modules/time-tables/time-tables.service'

import { CreateBoardInput, UpdateBoardInput } from './schemas/board.schemas'

type TimeTableRef = { id: string; name: string; isActive: boolean }

export type BoardSummaryView = {
  id: string
  name: string
  timeTable: TimeTableRef
  filledSlots: number
  blockedSlots: number
}

export type BoardView = {
  id: string
  name: string
  timeTable: TimeTableRef
  workingDays: number
  rows: {
    timeSlot: { id: string; name: string; startTime: string; endTime: string }
    cells: CellView[]
  }[]
  offerings: { offeringId: string; slots: number; weeklyMinutes: number }[]
  createdAt: Date
  updatedAt: Date
}

const timeTableRef = { select: { id: true, name: true, isActive: true } }

const withGrid = {
  timeTable: {
    select: {
      ...timeTableRef.select,
      slots: {
        select: { id: true, name: true, startTime: true, endTime: true },
        orderBy: { startTime: 'asc' },
      },
    },
  },
  slots: { include: withCellDetails },
} satisfies Prisma.BoardInclude

type BoardWithGrid = Prisma.BoardGetPayload<{ include: typeof withGrid }>

/**
 * Os quadros de um projeto (spec 0020): a grade de uma turma, com as linhas do bloco e as colunas
 * dos dias letivos. Lê quem vê o projeto; escreve quem a matriz da 0016 deixa editar. As células
 * moram em `board-slots/`, que usa `findBoard` daqui.
 */
@Injectable()
export class BoardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectAccessService,
    private readonly timeTables: TimeTablesService,
  ) {}

  /** Resumo, sem a grade, por nome. */
  async list(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
  ): Promise<BoardSummaryView[]> {
    const { project } = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    const boards = await this.database.board.findMany({
      where: { projectId: project.id },
      include: {
        timeTable: timeTableRef,
        slots: { select: { offeringId: true, isBlocked: true } },
      },
      orderBy: { name: 'asc' },
    })
    return boards.map(({ id, name, timeTable, slots }) => ({
      id,
      name,
      timeTable,
      filledSlots: slots.filter((slot) => slot.offeringId).length,
      blockedSlots: slots.filter((slot) => slot.isBlocked).length,
    }))
  }

  async get(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    boardId: string,
  ): Promise<BoardView> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    const board = await this.findBoard(access, boardId)
    return this.view(board.id, access)
  }

  /** Bloco da unidade do projeto e ativo (0017: desativado não é escolhido por quadro novo). */
  async create(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    { name, timeTableId }: CreateBoardInput,
  ): Promise<BoardView> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    await this.projects.assertProjectWritable(access)
    const timeTable = await this.findActiveTimeTable(access, timeTableId)
    await this.assertNameFree(access.project.id, name)

    try {
      const board = await this.database.board.create({
        data: { name, projectId: access.project.id, timeTableId: timeTable.id },
      })
      return this.view(board.id, access)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('BOARD_NAME_IN_USE')
      throw error
    }
  }

  /**
   * Trocar o bloco só com o quadro sem célula: as células apontam para horários do bloco atual.
   * Bloco desativado que o quadro já usa continua valendo.
   */
  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    boardId: string,
    { name, timeTableId }: UpdateBoardInput,
  ): Promise<BoardView> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    const board = await this.findBoard(access, boardId)
    await this.projects.assertProjectWritable(access)

    if (timeTableId !== undefined) {
      if (timeTableId !== board.timeTableId) await this.findActiveTimeTable(access, timeTableId)
      const slots = await this.database.boardSlot.count({ where: { boardId: board.id } })
      if (slots > 0) throw new AppException('BOARD_NOT_EMPTY')
    }
    if (name) await this.assertNameFree(access.project.id, name, board.id)

    try {
      await this.database.board.update({ where: { id: board.id }, data: { name, timeTableId } })
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('BOARD_NAME_IN_USE')
      throw error
    }
    return this.view(board.id, access)
  }

  /** Leva as células em cascata (0002). */
  async remove(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    boardId: string,
  ): Promise<void> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    const board = await this.findBoard(access, boardId)
    await this.projects.assertProjectWritable(access)
    await this.database.board.delete({ where: { id: board.id } })
  }

  /** De outro projeto, inexistente ou id fora do formato: 404. */
  async findBoard({ project }: ProjectAccess, boardId: string) {
    const board =
      z.cuid().safeParse(boardId).success &&
      (await this.database.board.findFirst({ where: { id: boardId, projectId: project.id } }))
    if (!board) throw new AppException('BOARD_NOT_FOUND')
    return board
  }

  private async view(boardId: string, access: ProjectAccess): Promise<BoardView> {
    const board = await this.database.board.findUniqueOrThrow({
      where: { id: boardId },
      include: withGrid,
    })
    return toView(board, access.project.workingDays)
  }

  private async findActiveTimeTable(access: ProjectAccess, timeTableId: string) {
    const timeTable = await this.timeTables.findInUnit(access.unit, timeTableId)
    if (!timeTable.isActive) throw new AppException('TIME_TABLE_INACTIVE')
    return timeTable
  }

  /** Nome único no projeto. */
  private async assertNameFree(projectId: string, name: string, boardId?: string) {
    const taken = await this.database.board.findUnique({
      where: { projectId_name: { projectId, name } },
      select: { id: true },
    })
    if (taken && taken.id !== boardId) throw new AppException('BOARD_NAME_IN_USE')
  }
}

/**
 * A grade inteira: os horários do bloco por início × os dias letivos, com as células que não têm
 * linha sintetizadas vazias. O resumo `offerings` é só deste quadro, na ordem da grade.
 */
function toView(
  {
    id,
    name,
    timeTable: { slots: timeSlots, ...timeTable },
    slots,
    createdAt,
    updatedAt,
  }: BoardWithGrid,
  workingDays: number,
): BoardView {
  const byPosition = new Map(slots.map((slot) => [`${slot.timeSlotId}:${slot.weekday}`, slot]))
  const offerings = new Map<string, { offeringId: string; slots: number; weeklyMinutes: number }>()

  const rows = timeSlots.map((timeSlot) => {
    const cells = Array.from({ length: workingDays }, (_, i) => {
      const slot = byPosition.get(`${timeSlot.id}:${i + 1}`)
      if (!slot) return emptyCell(i + 1)
      if (slot.offeringId) {
        const total = offerings.get(slot.offeringId) ?? {
          offeringId: slot.offeringId,
          slots: 0,
          weeklyMinutes: 0,
        }
        total.slots += 1
        total.weeklyMinutes += timeSlot.endTime - timeSlot.startTime
        offerings.set(slot.offeringId, total)
      }
      return toCellView(slot)
    })
    return {
      timeSlot: {
        id: timeSlot.id,
        name: timeSlot.name,
        startTime: toHHMM(timeSlot.startTime),
        endTime: toHHMM(timeSlot.endTime),
      },
      cells,
    }
  })

  return {
    id,
    name,
    timeTable,
    workingDays,
    rows,
    offerings: [...offerings.values()],
    createdAt,
    updatedAt,
  }
}
