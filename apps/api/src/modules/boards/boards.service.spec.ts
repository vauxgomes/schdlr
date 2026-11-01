import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { ProjectAccess, ProjectAccessService } from '@modules/projects/project-access.service'
import { TimeTablesService } from '@modules/time-tables/time-tables.service'

import { BoardsService } from './boards.service'

const BRD_ID = 'cmhboard00000000000000001'
const TT_ID = 'cmhtimetable0000000000001'
const TT2_ID = 'cmhtimetable0000000000002'

const projectAccess = (workingDays = 5) =>
  ({
    unit: { id: 'unit-1', isActive: true },
    project: { id: 'prj-1', workingDays },
  }) as unknown as ProjectAccess
const timeTable = { id: TT_ID, name: 'Manhã', isActive: true }
const M1 = { id: 'ts-1', name: 'M1', startTime: 420, endTime: 470 }
const M2 = { id: 'ts-2', name: 'M2', startTime: 470, endTime: 520 }
const offering = (id: string) => ({
  id,
  subject: { id: 'sub-1', name: 'Matemática I', code: 'MAT-101', color: '#1E88E5', isActive: true },
  teacher: null,
})
const location = { id: 'loc-1', name: 'Sala 101', type: 'CLASSROOM', isActive: true }
const slot = (
  timeSlotId: string,
  weekday: number,
  cell: { offeringId?: string; location?: boolean; isBlocked?: boolean } = {},
) => ({
  timeSlotId,
  weekday,
  offeringId: cell.offeringId ?? null,
  isBlocked: cell.isBlocked ?? false,
  offering: cell.offeringId ? offering(cell.offeringId) : null,
  location: cell.location ? location : null,
})
const gridRow = (slots: unknown[] = [], timeSlots = [M2, M1]) => ({
  id: BRD_ID,
  name: 'INFO 2A',
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T10:00:00.000Z'),
  // Já ordenados pelo banco; aqui fora de ordem para provar que a grade segue o que vem.
  timeTable: { ...timeTable, slots: timeSlots },
  slots,
})
const empty = (weekday: number) => ({ weekday, isBlocked: false, offering: null, location: null })
const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' })

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('BoardsService', () => {
  let db: {
    board: Record<
      | 'findMany'
      | 'findFirst'
      | 'findUnique'
      | 'findUniqueOrThrow'
      | 'create'
      | 'update'
      | 'delete',
      jest.Mock
    >
    boardSlot: { count: jest.Mock }
  }
  let projects: Record<'resolveProject' | 'assertProjectWritable', jest.Mock>
  let timeTables: { findInUnit: jest.Mock }
  let service: BoardsService

  beforeEach(() => {
    db = {
      board: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: BRD_ID, timeTableId: TT_ID }),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(gridRow()),
        create: jest.fn().mockResolvedValue({ id: BRD_ID }),
        update: jest.fn(),
        delete: jest.fn(),
      },
      boardSlot: { count: jest.fn().mockResolvedValue(0) },
    }
    projects = {
      resolveProject: jest.fn().mockResolvedValue(projectAccess()),
      assertProjectWritable: jest.fn(),
    }
    timeTables = { findInUnit: jest.fn().mockResolvedValue(timeTable) }
    service = new BoardsService(
      db as unknown as DatabaseService,
      projects as unknown as ProjectAccessService,
      timeTables as unknown as TimeTablesService,
    )
  })

  describe('get', () => {
    it('monta a grade inteira, horários × dias letivos, com as vazias sintetizadas', async () => {
      db.board.findUniqueOrThrow.mockResolvedValue(gridRow([], [M1, M2]))
      const board = await service.get('crd', 'acme', 'sede', 'prj-1', BRD_ID)
      expect(board).toEqual({
        id: BRD_ID,
        name: 'INFO 2A',
        timeTable,
        workingDays: 5,
        rows: [
          {
            timeSlot: { id: 'ts-1', name: 'M1', startTime: '07:00', endTime: '07:50' },
            cells: [1, 2, 3, 4, 5].map(empty),
          },
          {
            timeSlot: { id: 'ts-2', name: 'M2', startTime: '07:50', endTime: '08:40' },
            cells: [1, 2, 3, 4, 5].map(empty),
          },
        ],
        offerings: [],
        createdAt: new Date('2026-10-31T10:00:00.000Z'),
        updatedAt: new Date('2026-10-31T10:00:00.000Z'),
      })
      expect(db.board.findFirst).toHaveBeenCalledWith({
        where: { id: BRD_ID, projectId: 'prj-1' },
      })
    })

    it('preenche as células que existem e resume as ofertas deste quadro', async () => {
      projects.resolveProject.mockResolvedValue(projectAccess(6))
      db.board.findUniqueOrThrow.mockResolvedValue(
        gridRow(
          [
            slot('ts-1', 1, { offeringId: 'off-1', location: true }),
            slot('ts-2', 1, { offeringId: 'off-1' }),
            slot('ts-1', 2, { isBlocked: true }),
            slot('ts-2', 6, { location: true }),
          ],
          [M1, M2],
        ),
      )
      const board = await service.get('crd', 'acme', 'sede', 'prj-1', BRD_ID)
      expect(board.rows.map((row) => row.cells.length)).toEqual([6, 6])
      expect(board.rows[0].cells[0]).toEqual({
        weekday: 1,
        isBlocked: false,
        offering: offering('off-1'),
        location,
      })
      expect(board.rows[0].cells[1]).toEqual({ ...empty(2), isBlocked: true })
      expect(board.rows[1].cells[5]).toEqual({ ...empty(6), location })
      expect(board.offerings).toEqual([{ offeringId: 'off-1', slots: 2, weeklyMinutes: 100 }])
    })

    it('quadro de outro projeto ou id fora do formato dá BOARD_NOT_FOUND', async () => {
      db.board.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.get('crd', 'acme', 'sede', 'prj-1', BRD_ID))).toBe(
        'BOARD_NOT_FOUND',
      )
      db.board.findFirst.mockClear()
      expect(await codeOf(service.get('crd', 'acme', 'sede', 'prj-1', 'x'))).toBe('BOARD_NOT_FOUND')
      expect(db.board.findFirst).not.toHaveBeenCalled()
    })
  })

  it('list resume os quadros por nome, sem a grade', async () => {
    db.board.findMany.mockResolvedValue([
      {
        id: BRD_ID,
        name: 'INFO 2A',
        timeTable,
        slots: [
          { offeringId: 'off-1', isBlocked: false },
          { offeringId: null, isBlocked: false },
          { offeringId: null, isBlocked: true },
        ],
      },
    ])
    await expect(service.list('crd', 'acme', 'sede', 'prj-1')).resolves.toEqual([
      { id: BRD_ID, name: 'INFO 2A', timeTable, filledSlots: 1, blockedSlots: 1 },
    ])
    expect(db.board.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'prj-1' }, orderBy: { name: 'asc' } }),
    )
  })

  describe('create', () => {
    const input = { name: 'INFO 2A', timeTableId: TT_ID }

    it('cria com o bloco da unidade, pelo assertProjectWritable', async () => {
      await expect(service.create('crd', 'acme', 'sede', 'prj-1', input)).resolves.toMatchObject({
        id: BRD_ID,
      })
      expect(projects.assertProjectWritable).toHaveBeenCalledWith(projectAccess())
      expect(timeTables.findInUnit).toHaveBeenCalledWith({ id: 'unit-1', isActive: true }, TT_ID)
      expect(db.board.create).toHaveBeenCalledWith({
        data: { name: 'INFO 2A', projectId: 'prj-1', timeTableId: TT_ID },
      })
    })

    it('bloco desativado dá TIME_TABLE_INACTIVE; de fora da unidade, o 404 do findInUnit', async () => {
      timeTables.findInUnit.mockResolvedValue({ ...timeTable, isActive: false })
      expect(await codeOf(service.create('crd', 'acme', 'sede', 'prj-1', input))).toBe(
        'TIME_TABLE_INACTIVE',
      )
      timeTables.findInUnit.mockRejectedValue(new AppException('TIME_TABLE_NOT_FOUND'))
      expect(await codeOf(service.create('crd', 'acme', 'sede', 'prj-1', input))).toBe(
        'TIME_TABLE_NOT_FOUND',
      )
      expect(db.board.create).not.toHaveBeenCalled()
    })

    it('nome repetido no projeto dá BOARD_NAME_IN_USE, também pelo P2002', async () => {
      db.board.findUnique.mockResolvedValue({ id: 'other' })
      expect(await codeOf(service.create('crd', 'acme', 'sede', 'prj-1', input))).toBe(
        'BOARD_NAME_IN_USE',
      )
      db.board.findUnique.mockResolvedValue(null)
      db.board.create.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.create('crd', 'acme', 'sede', 'prj-1', input))).toBe(
        'BOARD_NAME_IN_USE',
      )
    })

    it('a matriz barra antes do bloco', async () => {
      projects.assertProjectWritable.mockRejectedValue(new AppException('TERM_STATUS_FORBIDS'))
      expect(await codeOf(service.create('crd', 'acme', 'sede', 'prj-1', input))).toBe(
        'TERM_STATUS_FORBIDS',
      )
      expect(timeTables.findInUnit).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('renomeia; o próprio nome passa', async () => {
      db.board.findUnique.mockResolvedValue({ id: BRD_ID })
      await service.update('crd', 'acme', 'sede', 'prj-1', BRD_ID, { name: 'INFO 2B' })
      expect(db.board.update).toHaveBeenCalledWith({
        where: { id: BRD_ID },
        data: { name: 'INFO 2B', timeTableId: undefined },
      })
      expect(db.boardSlot.count).not.toHaveBeenCalled()
    })

    it('troca o bloco do quadro vazio', async () => {
      timeTables.findInUnit.mockResolvedValue({ ...timeTable, id: TT2_ID })
      await service.update('crd', 'acme', 'sede', 'prj-1', BRD_ID, { timeTableId: TT2_ID })
      expect(db.board.update).toHaveBeenCalledWith({
        where: { id: BRD_ID },
        data: { name: undefined, timeTableId: TT2_ID },
      })
    })

    it('com célula dá BOARD_NOT_EMPTY, também mandando o mesmo bloco', async () => {
      db.boardSlot.count.mockResolvedValue(1)
      timeTables.findInUnit.mockResolvedValue({ ...timeTable, id: TT2_ID })
      expect(
        await codeOf(
          service.update('crd', 'acme', 'sede', 'prj-1', BRD_ID, { timeTableId: TT2_ID }),
        ),
      ).toBe('BOARD_NOT_EMPTY')
      expect(
        await codeOf(
          service.update('crd', 'acme', 'sede', 'prj-1', BRD_ID, { timeTableId: TT_ID }),
        ),
      ).toBe('BOARD_NOT_EMPTY')
      expect(db.board.update).not.toHaveBeenCalled()
    })

    it('bloco novo desativado dá TIME_TABLE_INACTIVE; o atual desativado continua valendo', async () => {
      timeTables.findInUnit.mockResolvedValue({ ...timeTable, id: TT2_ID, isActive: false })
      expect(
        await codeOf(
          service.update('crd', 'acme', 'sede', 'prj-1', BRD_ID, { timeTableId: TT2_ID }),
        ),
      ).toBe('TIME_TABLE_INACTIVE')
      timeTables.findInUnit.mockClear()
      await service.update('crd', 'acme', 'sede', 'prj-1', BRD_ID, {
        name: 'INFO 2B',
        timeTableId: TT_ID,
      })
      expect(timeTables.findInUnit).not.toHaveBeenCalled()
      expect(db.board.update).toHaveBeenCalled()
    })
  })

  it('remove passa pelo assertProjectWritable e apaga', async () => {
    await expect(service.remove('crd', 'acme', 'sede', 'prj-1', BRD_ID)).resolves.toBeUndefined()
    expect(projects.assertProjectWritable).toHaveBeenCalledWith(projectAccess())
    expect(db.board.delete).toHaveBeenCalledWith({ where: { id: BRD_ID } })
  })

  it('quem não vê o projeto recebe o 404 do resolveProject', async () => {
    projects.resolveProject.mockRejectedValue(new AppException('PROJECT_NOT_FOUND'))
    expect(await codeOf(service.list('tch', 'acme', 'sede', 'prj-1'))).toBe('PROJECT_NOT_FOUND')
  })
})
