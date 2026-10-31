import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'
import { TimeTablesService } from '@modules/time-tables/time-tables.service'

import { TimeSlotsService } from './time-slots.service'

const TT_ID = 'cmhtimetable0000000000001'
const SLOT_ID = 'cmhtimeslot00000000000001'

const access = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})
const slot = (overrides: Record<string, unknown> = {}) => ({
  id: SLOT_ID,
  timeTableId: TT_ID,
  name: 'M1',
  startTime: 420,
  endTime: 470,
  _count: { boardSlots: 0 },
  ...overrides,
})
const m2 = { id: 's-2', name: 'M2', startTime: 470, endTime: 520 }
const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' })

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return error as AppException
}
const codeOf = async (promise: Promise<unknown>) => (await errorOf(promise)).code

describe('TimeSlotsService', () => {
  let tx: {
    $queryRaw: jest.Mock
    timeSlot: Record<'findMany' | 'create' | 'update', jest.Mock>
  }
  let db: {
    $transaction: jest.Mock
    timeSlot: Record<'findFirst' | 'delete', jest.Mock>
  }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let timeTables: Record<'findInUnit' | 'view', jest.Mock>
  let service: TimeSlotsService

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      timeSlot: {
        findMany: jest.fn().mockResolvedValue([m2]),
        create: jest.fn(),
        update: jest.fn(),
      },
    }
    db = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      timeSlot: { findFirst: jest.fn().mockResolvedValue(slot()), delete: jest.fn() },
    }
    tenants = {
      resolveUnit: jest.fn().mockResolvedValue(access({ isManager: true })),
      assertWritable: jest.fn(),
    }
    timeTables = {
      findInUnit: jest.fn().mockResolvedValue({ id: TT_ID, isActive: true }),
      view: jest.fn().mockResolvedValue({ id: TT_ID, slots: [] }),
    }
    service = new TimeSlotsService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
      timeTables as unknown as TimeTablesService,
    )
  })

  describe('create', () => {
    const input = { name: 'M3', startTime: '08:40', endTime: '09:30' }

    it('trava o bloco, lê os horários e cria em minutos; responde com o bloco', async () => {
      await expect(service.create('mgr', 'acme', 'sede', TT_ID, input)).resolves.toEqual({
        id: TT_ID,
        slots: [],
      })
      const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray]
      expect(sql.join('?')).toBe('SELECT id FROM time_tables WHERE id = ? FOR UPDATE')
      expect(tx.timeSlot.findMany).toHaveBeenCalledWith({
        where: { timeTableId: TT_ID },
        orderBy: { startTime: 'asc' },
      })
      expect(tx.timeSlot.create).toHaveBeenCalledWith({
        data: { name: 'M3', startTime: 520, endTime: 570, timeTableId: TT_ID },
      })
    })

    it('encostar no vizinho passa; sobrepor dá TIME_SLOT_OVERLAP com o horário que bate', async () => {
      await expect(
        service.create('mgr', 'acme', 'sede', TT_ID, { ...input, startTime: '08:40' }),
      ).resolves.toBeDefined()

      const error = await errorOf(
        service.create('mgr', 'acme', 'sede', TT_ID, { ...input, startTime: '08:20' }),
      )
      expect(error.code).toBe('TIME_SLOT_OVERLAP')
      expect(error.params).toEqual({
        slotId: 's-2',
        name: 'M2',
        startTime: '07:50',
        endTime: '08:40',
      })
    })

    it('nome usado no bloco dá TIME_SLOT_NAME_IN_USE, também pelo P2002', async () => {
      expect(
        await codeOf(service.create('mgr', 'acme', 'sede', TT_ID, { ...input, name: 'M2' })),
      ).toBe('TIME_SLOT_NAME_IN_USE')
      tx.timeSlot.create.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.create('mgr', 'acme', 'sede', TT_ID, input))).toBe(
        'TIME_SLOT_NAME_IN_USE',
      )
    })

    it('o 49º horário dá TIME_TABLE_FULL com params', async () => {
      tx.timeSlot.findMany.mockResolvedValue(
        Array.from({ length: 48 }, (_, i) => ({
          id: `s${i}`,
          name: `H${i}`,
          startTime: i,
          endTime: i + 1,
        })),
      )
      const error = await errorOf(service.create('mgr', 'acme', 'sede', TT_ID, input))
      expect(error.code).toBe('TIME_TABLE_FULL')
      expect(error.params).toEqual({ max: 48 })
      expect(tx.timeSlot.create).not.toHaveBeenCalled()
    })

    it('bloco desativado dá TIME_TABLE_INACTIVE', async () => {
      timeTables.findInUnit.mockResolvedValue({ id: TT_ID, isActive: false })
      expect(await codeOf(service.create('mgr', 'acme', 'sede', TT_ID, input))).toBe(
        'TIME_TABLE_INACTIVE',
      )
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('sem papel dá NOT_ALLOWED antes de assertWritable', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      expect(await codeOf(service.create('crd', 'acme', 'sede', TT_ID, input))).toBe('NOT_ALLOWED')
      expect(tenants.assertWritable).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('a regra das horas vale para o resultado', async () => {
      const error = await errorOf(
        service.update('mgr', 'acme', 'sede', TT_ID, SLOT_ID, { endTime: '06:00' }),
      )
      expect(error.code).toBe('VALIDATION_FAILED')
      expect(error.errors).toEqual([
        {
          path: 'endTime',
          code: 'END_NOT_AFTER_START',
          message: 'End time must be after start time',
        },
      ])
    })

    it('na edição, o próprio horário não conta para a sobreposição', async () => {
      await service.update('mgr', 'acme', 'sede', TT_ID, SLOT_ID, { startTime: '06:50' })
      expect(tx.timeSlot.findMany).toHaveBeenCalledWith({
        where: { timeTableId: TT_ID, id: { not: SLOT_ID } },
        orderBy: { startTime: 'asc' },
      })
      expect(tx.timeSlot.update).toHaveBeenCalledWith({
        where: { id: SLOT_ID },
        data: { name: 'M1', startTime: 410, endTime: 470 },
      })
    })

    it('estender sobre o vizinho dá TIME_SLOT_OVERLAP', async () => {
      expect(
        await codeOf(service.update('mgr', 'acme', 'sede', TT_ID, SLOT_ID, { endTime: '08:00' })),
      ).toBe('TIME_SLOT_OVERLAP')
    })

    it('horário com célula não muda de hora, mas renomeia', async () => {
      db.timeSlot.findFirst.mockResolvedValue(slot({ _count: { boardSlots: 1 } }))
      expect(
        await codeOf(service.update('mgr', 'acme', 'sede', TT_ID, SLOT_ID, { startTime: '06:50' })),
      ).toBe('TIME_SLOT_IN_USE')
      await expect(
        service.update('mgr', 'acme', 'sede', TT_ID, SLOT_ID, { name: '1º horário' }),
      ).resolves.toBeDefined()
      await expect(
        service.update('mgr', 'acme', 'sede', TT_ID, SLOT_ID, { startTime: '07:00' }),
      ).resolves.toBeDefined()
    })

    it('horário de outro bloco, ou id fora do formato, dá TIME_SLOT_NOT_FOUND', async () => {
      db.timeSlot.findFirst.mockResolvedValue(null)
      expect(
        await codeOf(service.update('mgr', 'acme', 'sede', TT_ID, SLOT_ID, { name: 'X' })),
      ).toBe('TIME_SLOT_NOT_FOUND')
      expect(db.timeSlot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SLOT_ID, timeTableId: TT_ID } }),
      )
      db.timeSlot.findFirst.mockClear()
      expect(await codeOf(service.update('mgr', 'acme', 'sede', TT_ID, 'x', { name: 'X' }))).toBe(
        'TIME_SLOT_NOT_FOUND',
      )
      expect(db.timeSlot.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('apaga sem célula', async () => {
      await expect(service.remove('mgr', 'acme', 'sede', TT_ID, SLOT_ID)).resolves.toBeUndefined()
      expect(db.timeSlot.delete).toHaveBeenCalledWith({ where: { id: SLOT_ID } })
    })

    it('com célula dá TIME_SLOT_IN_USE; o P2003 também', async () => {
      db.timeSlot.findFirst.mockResolvedValue(slot({ _count: { boardSlots: 2 } }))
      expect(await codeOf(service.remove('mgr', 'acme', 'sede', TT_ID, SLOT_ID))).toBe(
        'TIME_SLOT_IN_USE',
      )
      expect(db.timeSlot.delete).not.toHaveBeenCalled()

      db.timeSlot.findFirst.mockResolvedValue(slot())
      db.timeSlot.delete.mockRejectedValue(prismaError('P2003'))
      expect(await codeOf(service.remove('mgr', 'acme', 'sede', TT_ID, SLOT_ID))).toBe(
        'TIME_SLOT_IN_USE',
      )
    })

    it('em bloco desativado dá TIME_TABLE_INACTIVE', async () => {
      timeTables.findInUnit.mockResolvedValue({ id: TT_ID, isActive: false })
      expect(await codeOf(service.remove('mgr', 'acme', 'sede', TT_ID, SLOT_ID))).toBe(
        'TIME_TABLE_INACTIVE',
      )
    })
  })
})
