import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import { TimeTablesService } from './time-tables.service'

const TT_ID = 'cmhtimetable0000000000001'

const access = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})
const timeTable = (overrides: Record<string, unknown> = {}) => ({
  id: TT_ID,
  unitId: 'unit-1',
  name: 'Manhã',
  isActive: true,
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T10:00:00.000Z'),
  slots: [
    { id: 's-1', name: 'M1', startTime: 420, endTime: 470, _count: { boardSlots: 1 } },
    { id: 's-2', name: 'M2', startTime: 470, endTime: 520, _count: { boardSlots: 0 } },
  ],
  _count: { boards: 0 },
  ...overrides,
})
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

describe('TimeTablesService', () => {
  let db: {
    timeTable: Record<
      | 'findMany'
      | 'findFirst'
      | 'findUnique'
      | 'findUniqueOrThrow'
      | 'create'
      | 'update'
      | 'delete',
      jest.Mock
    >
    timeSlot: { findMany: jest.Mock }
    board: { count: jest.Mock }
  }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let service: TimeTablesService

  beforeEach(() => {
    db = {
      timeTable: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(timeTable()),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(timeTable()),
        create: jest.fn().mockResolvedValue(timeTable()),
        update: jest.fn(),
        delete: jest.fn(),
      },
      timeSlot: { findMany: jest.fn().mockResolvedValue([]) },
      board: { count: jest.fn().mockResolvedValue(0) },
    }
    tenants = {
      resolveUnit: jest.fn().mockResolvedValue(access({ isManager: true })),
      assertWritable: jest.fn(),
    }
    service = new TimeTablesService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
    )
  })

  it('list devolve os blocos por nome, horários em HH:MM por início, no formato da spec', async () => {
    tenants.resolveUnit.mockResolvedValue(access())
    db.timeTable.findMany.mockResolvedValue([timeTable({ isActive: false, _count: { boards: 2 } })])
    await expect(service.list('tch', 'acme', 'sede')).resolves.toEqual([
      {
        id: TT_ID,
        name: 'Manhã',
        isActive: false,
        createdAt: new Date('2026-10-31T10:00:00.000Z'),
        updatedAt: new Date('2026-10-31T10:00:00.000Z'),
        slots: [
          { id: 's-1', name: 'M1', startTime: '07:00', endTime: '07:50', inUse: true },
          { id: 's-2', name: 'M2', startTime: '07:50', endTime: '08:40', inUse: false },
        ],
        boardsCount: 2,
        access: { canManage: false },
      },
    ])
    const [query] = db.timeTable.findMany.mock.calls[0] as [
      { where: unknown; orderBy: unknown; include: { slots: { orderBy: unknown } } },
    ]
    expect(query.where).toEqual({ unitId: 'unit-1' })
    expect(query.orderBy).toEqual({ name: 'asc' })
    expect(query.include.slots.orderBy).toEqual({ startTime: 'asc' })
  })

  it('bloco de outra unidade, ou id fora do formato, dá TIME_TABLE_NOT_FOUND', async () => {
    db.timeTable.findFirst.mockResolvedValue(null)
    expect(await codeOf(service.get('tch', 'acme', 'sede', TT_ID))).toBe('TIME_TABLE_NOT_FOUND')
    expect(db.timeTable.findFirst).toHaveBeenCalledWith({ where: { id: TT_ID, unitId: 'unit-1' } })
    db.timeTable.findFirst.mockClear()
    expect(await codeOf(service.get('tch', 'acme', 'sede', 'x'))).toBe('TIME_TABLE_NOT_FOUND')
    expect(db.timeTable.findFirst).not.toHaveBeenCalled()
  })

  describe('create', () => {
    const input = {
      name: 'Manhã',
      slots: [
        { name: 'M1', startTime: '07:00', endTime: '07:50' },
        { name: 'M2', startTime: '07:50', endTime: '08:40' },
      ],
    }

    it('cria o bloco com os horários em minutos, numa operação só', async () => {
      await expect(service.create('mgr', 'acme', 'sede', input)).resolves.toMatchObject({
        name: 'Manhã',
      })
      expect(tenants.assertWritable).toHaveBeenCalled()
      expect(db.timeTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Manhã',
            unitId: 'unit-1',
            slots: {
              create: [
                { name: 'M1', startTime: 420, endTime: 470 },
                { name: 'M2', startTime: 470, endTime: 520 },
              ],
            },
          },
        }),
      )
    })

    it('coordenador ou professor dá NOT_ALLOWED antes de assertWritable', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe('NOT_ALLOWED')
      expect(tenants.assertWritable).not.toHaveBeenCalled()
    })

    it('nome usado na unidade dá TIME_TABLE_NAME_IN_USE, também pelo P2002', async () => {
      db.timeTable.findUnique.mockResolvedValue({ id: 'outro' })
      expect(await codeOf(service.create('mgr', 'acme', 'sede', input))).toBe(
        'TIME_TABLE_NAME_IN_USE',
      )
      db.timeTable.findUnique.mockResolvedValue(null)
      db.timeTable.create.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.create('mgr', 'acme', 'sede', input))).toBe(
        'TIME_TABLE_NAME_IN_USE',
      )
    })

    it('nome de horário repetido na lista dá TIME_SLOT_NAME_IN_USE e nada é criado', async () => {
      const dup = { name: 'X', slots: [input.slots[0], { ...input.slots[1], name: 'M1' }] }
      expect(await codeOf(service.create('mgr', 'acme', 'sede', dup))).toBe('TIME_SLOT_NAME_IN_USE')
      expect(db.timeTable.create).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('renomeia', async () => {
      await service.update('mgr', 'acme', 'sede', TT_ID, { name: 'Tarde' })
      expect(db.timeTable.update).toHaveBeenCalledWith({
        where: { id: TT_ID },
        data: { name: 'Tarde' },
      })
    })

    it('sem papel dá NOT_ALLOWED', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      expect(await codeOf(service.update('tch', 'acme', 'sede', TT_ID, { name: 'X' }))).toBe(
        'NOT_ALLOWED',
      )
    })

    it('desativado dá TIME_TABLE_INACTIVE; { isActive: true } reativa', async () => {
      db.timeTable.findFirst.mockResolvedValue(timeTable({ isActive: false }))
      expect(await codeOf(service.update('mgr', 'acme', 'sede', TT_ID, { name: 'X' }))).toBe(
        'TIME_TABLE_INACTIVE',
      )
      await expect(
        service.update('mgr', 'acme', 'sede', TT_ID, { isActive: true }),
      ).resolves.toBeDefined()
    })
  })

  describe('remove', () => {
    it('apaga sem quadro, inclusive desativado', async () => {
      db.timeTable.findFirst.mockResolvedValue(timeTable({ isActive: false }))
      await expect(service.remove('mgr', 'acme', 'sede', TT_ID)).resolves.toBeUndefined()
      expect(db.board.count).toHaveBeenCalledWith({ where: { timeTableId: TT_ID } })
      expect(db.timeTable.delete).toHaveBeenCalledWith({ where: { id: TT_ID } })
    })

    it('usado por quadro dá TIME_TABLE_IN_USE; o P2003 também', async () => {
      db.board.count.mockResolvedValue(1)
      expect(await codeOf(service.remove('mgr', 'acme', 'sede', TT_ID))).toBe('TIME_TABLE_IN_USE')
      expect(db.timeTable.delete).not.toHaveBeenCalled()

      db.board.count.mockResolvedValue(0)
      db.timeTable.delete.mockRejectedValue(prismaError('P2003'))
      expect(await codeOf(service.remove('mgr', 'acme', 'sede', TT_ID))).toBe('TIME_TABLE_IN_USE')
    })
  })

  describe('duplicate', () => {
    it('copia os horários num bloco novo, inclusive de origem desativada', async () => {
      db.timeTable.findFirst.mockResolvedValue(timeTable({ isActive: false }))
      const copied = [{ name: 'M1', startTime: 420, endTime: 470 }]
      db.timeSlot.findMany.mockResolvedValue(copied)
      await service.duplicate('mgr', 'acme', 'sede', TT_ID, { name: 'Manhã 2027' })
      expect(db.timeSlot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { timeTableId: TT_ID } }),
      )
      expect(db.timeTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Manhã 2027', unitId: 'unit-1', slots: { create: copied } },
        }),
      )
    })

    it('nome repetido dá TIME_TABLE_NAME_IN_USE', async () => {
      db.timeTable.findUnique.mockResolvedValue({ id: 'outro' })
      expect(await codeOf(service.duplicate('mgr', 'acme', 'sede', TT_ID, { name: 'Manhã' }))).toBe(
        'TIME_TABLE_NAME_IN_USE',
      )
      expect(db.timeTable.create).not.toHaveBeenCalled()
    })

    it('sem papel dá NOT_ALLOWED', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      expect(await codeOf(service.duplicate('tch', 'acme', 'sede', TT_ID, { name: 'X' }))).toBe(
        'NOT_ALLOWED',
      )
    })
  })
})
