import { Injectable } from '@nestjs/common'
import { Board } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { BoardsService } from '@modules/boards/boards.service'
import { ProjectAccess, ProjectAccessService } from '@modules/projects/project-access.service'

import { CellView, emptyCell, toCellView, withCellDetails } from './board-slot-view'
import { isEmptyCell, PutBoardSlotInput } from './schemas/board-slot.schemas'

export type BoardSlotView = CellView & { timeSlotId: string }

/**
 * As células de um quadro (spec 0020). A linha só existe com conteúdo: oferta, local ou bloqueio.
 * Nada aqui verifica choque; a spec de choque acrescenta.
 */
@Injectable()
export class BoardSlotsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectAccessService,
    private readonly boards: BoardsService,
  ) {}

  /** Define o estado inteiro da célula: o vazio apaga a linha, o resto cria ou atualiza. */
  async put(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    boardId: string,
    timeSlotId: string,
    weekday: string,
    body: PutBoardSlotInput,
  ): Promise<BoardSlotView> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    const board = await this.boards.findBoard(access, boardId)
    const position = await this.findPosition(access, board, timeSlotId, weekday)
    await this.projects.assertProjectWritable(access)

    const key = { boardId: board.id, ...position }
    if (isEmptyCell(body)) {
      await this.database.boardSlot.deleteMany({ where: key })
      return { ...emptyCell(position.weekday), timeSlotId: position.timeSlotId }
    }

    await this.assertOffering(access, body.offeringId)
    await this.assertLocation(access, key, body.locationId)

    const data = {
      offeringId: body.offeringId,
      locationId: body.locationId,
      isBlocked: body.isBlocked,
    }
    const slot = await this.database.boardSlot.upsert({
      where: { boardId_timeSlotId_weekday: key },
      create: { ...key, ...data },
      update: data,
      include: withCellDetails,
    })
    return { ...toCellView(slot), timeSlotId: slot.timeSlotId }
  }

  /** Horário do bloco do quadro e dia de 1 aos dias letivos; o resto não existe na grade. */
  private async findPosition(
    { project }: ProjectAccess,
    board: Board,
    timeSlotId: string,
    weekday: string,
  ) {
    const day = /^\d+$/.test(weekday) ? Number(weekday) : 0
    const timeSlot =
      day >= 1 &&
      day <= project.workingDays &&
      z.cuid().safeParse(timeSlotId).success &&
      (await this.database.timeSlot.findFirst({
        where: { id: timeSlotId, timeTableId: board.timeTableId },
        select: { id: true },
      }))
    if (!timeSlot) throw new AppException('BOARD_SLOT_NOT_FOUND')
    return { timeSlotId: timeSlot.id, weekday: day }
  }

  /** Do projeto do caminho; sem professor e de disciplina desativada são aceitas (0019). */
  private async assertOffering({ project }: ProjectAccess, offeringId: string | null) {
    if (offeringId === null) return
    const offering =
      z.cuid().safeParse(offeringId).success &&
      (await this.database.offering.findFirst({
        where: { id: offeringId, projectId: project.id },
        select: { id: true },
      }))
    if (!offering) throw new AppException('INVALID_OFFERING')
  }

  /** Da unidade; desativado não recebe alocação nova, mas a que já estava na célula passa (0015). */
  private async assertLocation(
    { unit }: ProjectAccess,
    key: { boardId: string; timeSlotId: string; weekday: number },
    locationId: string | null,
  ) {
    if (locationId === null) return
    const location =
      z.cuid().safeParse(locationId).success &&
      (await this.database.location.findFirst({
        where: { id: locationId, unitId: unit.id },
        select: { id: true, isActive: true },
      }))
    if (!location) throw new AppException('INVALID_LOCATION')
    if (location.isActive) return

    const current = await this.database.boardSlot.findUnique({
      where: { boardId_timeSlotId_weekday: key },
      select: { locationId: true },
    })
    if (current?.locationId !== location.id) throw new AppException('LOCATION_INACTIVE')
  }
}
