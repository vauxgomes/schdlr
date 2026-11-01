import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { BoardsService } from '@modules/boards/boards.service'
import { ProjectAccess, ProjectAccessService } from '@modules/projects/project-access.service'

import { BoardSlotsService } from './board-slots.service'

const BRD_ID = 'cmhboard00000000000000001'
const TS_ID = 'cmhtimeslot00000000000001'
const OFF_ID = 'cmhoffering00000000000001'
const LOC_ID = 'cmhlocation00000000000001'

const projectAccess = () =>
  ({
    unit: { id: 'unit-1', isActive: true },
    project: { id: 'prj-1', workingDays: 5 },
  }) as unknown as ProjectAccess
const key = { boardId: BRD_ID, timeSlotId: TS_ID, weekday: 1 }
const offering = {
  id: OFF_ID,
  subject: { id: 'sub-1', name: 'Matemática I', code: 'MAT-101', color: '#1E88E5', isActive: true },
  teacher: null,
}
const location = { id: LOC_ID, name: 'Sala 101', type: 'CLASSROOM', isActive: true }

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('BoardSlotsService', () => {
  let db: {
    boardSlot: Record<'upsert' | 'deleteMany' | 'findUnique', jest.Mock>
    timeSlot: { findFirst: jest.Mock }
    offering: { findFirst: jest.Mock }
    location: { findFirst: jest.Mock }
  }
  let projects: Record<'resolveProject' | 'assertProjectWritable', jest.Mock>
  let boards: { findBoard: jest.Mock }
  let service: BoardSlotsService

  const put = (
    body: { offeringId: string | null; locationId: string | null; isBlocked: boolean },
    timeSlotId = TS_ID,
    weekday = '1',
  ) => service.put('crd', 'acme', 'sede', 'prj-1', BRD_ID, timeSlotId, weekday, body)

  beforeEach(() => {
    db = {
      boardSlot: {
        upsert: jest.fn().mockResolvedValue({
          ...key,
          isBlocked: false,
          offering,
          location,
        }),
        deleteMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      timeSlot: { findFirst: jest.fn().mockResolvedValue({ id: TS_ID }) },
      offering: { findFirst: jest.fn().mockResolvedValue({ id: OFF_ID }) },
      location: { findFirst: jest.fn().mockResolvedValue({ id: LOC_ID, isActive: true }) },
    }
    projects = {
      resolveProject: jest.fn().mockResolvedValue(projectAccess()),
      assertProjectWritable: jest.fn(),
    }
    boards = { findBoard: jest.fn().mockResolvedValue({ id: BRD_ID, timeTableId: 'tt-1' }) }
    service = new BoardSlotsService(
      db as unknown as DatabaseService,
      projects as unknown as ProjectAccessService,
      boards as unknown as BoardsService,
    )
  })

  it('aloca oferta e local: upsert na chave única, responde a célula com timeSlotId', async () => {
    await expect(
      put({ offeringId: OFF_ID, locationId: LOC_ID, isBlocked: false }),
    ).resolves.toEqual({ weekday: 1, isBlocked: false, offering, location, timeSlotId: TS_ID })
    expect(projects.assertProjectWritable).toHaveBeenCalledWith(projectAccess())
    expect(db.timeSlot.findFirst).toHaveBeenCalledWith({
      where: { id: TS_ID, timeTableId: 'tt-1' },
      select: { id: true },
    })
    expect(db.offering.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OFF_ID, projectId: 'prj-1' } }),
    )
    expect(db.location.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LOC_ID, unitId: 'unit-1' } }),
    )
    const data = { offeringId: OFF_ID, locationId: LOC_ID, isBlocked: false }
    expect(db.boardSlot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { boardId_timeSlotId_weekday: key },
        create: { ...key, ...data },
        update: data,
      }),
    )
  })

  it('bloqueia: cria a linha sem oferta nem local', async () => {
    db.boardSlot.upsert.mockResolvedValue({
      ...key,
      isBlocked: true,
      offering: null,
      location: null,
    })
    await expect(put({ offeringId: null, locationId: null, isBlocked: true })).resolves.toEqual({
      weekday: 1,
      isBlocked: true,
      offering: null,
      location: null,
      timeSlotId: TS_ID,
    })
    expect(db.offering.findFirst).not.toHaveBeenCalled()
    expect(db.location.findFirst).not.toHaveBeenCalled()
  })

  it('estado vazio apaga a linha, se existir, e responde a célula vazia', async () => {
    await expect(put({ offeringId: null, locationId: null, isBlocked: false })).resolves.toEqual({
      weekday: 1,
      isBlocked: false,
      offering: null,
      location: null,
      timeSlotId: TS_ID,
    })
    expect(db.boardSlot.deleteMany).toHaveBeenCalledWith({ where: key })
    expect(db.boardSlot.upsert).not.toHaveBeenCalled()
  })

  it.each([
    ['horário de outro bloco', TS_ID, '1', null],
    ['horário fora do formato', 'x', '1', undefined],
    ['dia 0', TS_ID, '0', undefined],
    ['dia além dos dias letivos', TS_ID, '6', undefined],
    ['dia fora do formato', TS_ID, '1a', undefined],
  ])('%s dá BOARD_SLOT_NOT_FOUND', async (_label, timeSlotId, weekday, found) => {
    if (found === null) db.timeSlot.findFirst.mockResolvedValue(null)
    const body = { offeringId: null, locationId: null, isBlocked: true }
    expect(await codeOf(put(body, timeSlotId, weekday))).toBe('BOARD_SLOT_NOT_FOUND')
    if (found === undefined) expect(db.timeSlot.findFirst).not.toHaveBeenCalled()
    expect(projects.assertProjectWritable).not.toHaveBeenCalled()
  })

  it('oferta de outro projeto, ou id fora do formato, dá INVALID_OFFERING', async () => {
    db.offering.findFirst.mockResolvedValue(null)
    expect(await codeOf(put({ offeringId: OFF_ID, locationId: null, isBlocked: false }))).toBe(
      'INVALID_OFFERING',
    )
    expect(await codeOf(put({ offeringId: 'x', locationId: null, isBlocked: false }))).toBe(
      'INVALID_OFFERING',
    )
    expect(db.boardSlot.upsert).not.toHaveBeenCalled()
  })

  it('local de outra unidade dá INVALID_LOCATION', async () => {
    db.location.findFirst.mockResolvedValue(null)
    expect(await codeOf(put({ offeringId: null, locationId: LOC_ID, isBlocked: false }))).toBe(
      'INVALID_LOCATION',
    )
  })

  it('local desativado só barra alocação nova', async () => {
    db.location.findFirst.mockResolvedValue({ id: LOC_ID, isActive: false })
    db.boardSlot.findUnique.mockResolvedValue({ locationId: 'other' })
    expect(await codeOf(put({ offeringId: OFF_ID, locationId: LOC_ID, isBlocked: false }))).toBe(
      'LOCATION_INACTIVE',
    )
    expect(db.boardSlot.findUnique).toHaveBeenCalledWith({
      where: { boardId_timeSlotId_weekday: key },
      select: { locationId: true },
    })
    db.boardSlot.findUnique.mockResolvedValue({ locationId: LOC_ID })
    await expect(
      put({ offeringId: OFF_ID, locationId: LOC_ID, isBlocked: false }),
    ).resolves.toBeDefined()
  })

  it('a matriz barra antes de mexer na célula', async () => {
    projects.assertProjectWritable.mockRejectedValue(new AppException('TERM_STATUS_FORBIDS'))
    expect(await codeOf(put({ offeringId: null, locationId: null, isBlocked: false }))).toBe(
      'TERM_STATUS_FORBIDS',
    )
    expect(db.boardSlot.deleteMany).not.toHaveBeenCalled()
  })

  it('quadro de outro projeto dá o 404 do findBoard', async () => {
    boards.findBoard.mockRejectedValue(new AppException('BOARD_NOT_FOUND'))
    expect(await codeOf(put({ offeringId: null, locationId: null, isBlocked: true }))).toBe(
      'BOARD_NOT_FOUND',
    )
  })
})
