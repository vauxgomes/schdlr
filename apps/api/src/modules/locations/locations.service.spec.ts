import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import { LocationsService } from './locations.service'

const LOCATION_ID = 'cmhlocation00000000000001'

const access = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})
const location = (overrides: Record<string, unknown> = {}) => ({
  id: LOCATION_ID,
  unitId: 'unit-1',
  name: 'Lab. de Redes',
  type: 'LAB',
  capacity: 30,
  isActive: true,
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T10:00:00.000Z'),
  _count: { boardSlots: 0 },
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

describe('LocationsService', () => {
  let db: {
    location: Record<
      'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'delete',
      jest.Mock
    >
  }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let service: LocationsService

  beforeEach(() => {
    db = {
      location: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(location()),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(location()),
        update: jest.fn().mockResolvedValue(location()),
        delete: jest.fn(),
      },
    }
    tenants = {
      resolveUnit: jest.fn().mockResolvedValue(access({ isManager: true })),
      assertWritable: jest.fn(),
    }
    service = new LocationsService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
    )
  })

  describe('list', () => {
    it('todos da unidade, ativos ou não, por nome, no formato da spec', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      db.location.findMany.mockResolvedValue([
        location({ isActive: false, _count: { boardSlots: 3 } }),
      ])
      await expect(service.list('tch', 'acme', 'sede', {})).resolves.toEqual([
        {
          id: LOCATION_ID,
          name: 'Lab. de Redes',
          type: 'LAB',
          capacity: 30,
          isActive: false,
          createdAt: new Date('2026-10-31T10:00:00.000Z'),
          updatedAt: new Date('2026-10-31T10:00:00.000Z'),
          inUse: true,
          access: { canManage: false },
        },
      ])
      expect(db.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId: 'unit-1' }, orderBy: { name: 'asc' } }),
      )
    })

    it('?type= filtra', async () => {
      db.location.findMany.mockResolvedValue([])
      await service.list('mgr', 'acme', 'sede', { type: 'VIRTUAL' })
      expect(db.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId: 'unit-1', type: 'VIRTUAL' } }),
      )
    })
  })

  describe('get', () => {
    it('procura o local na unidade do caminho', async () => {
      await expect(service.get('tch', 'acme', 'sede', LOCATION_ID)).resolves.toMatchObject({
        id: LOCATION_ID,
        access: { canManage: true },
      })
      expect(db.location.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LOCATION_ID, unitId: 'unit-1' } }),
      )
    })

    it('de outra unidade, ou id fora do formato, dá LOCATION_NOT_FOUND', async () => {
      db.location.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.get('tch', 'acme', 'sede', LOCATION_ID))).toBe(
        'LOCATION_NOT_FOUND',
      )
      db.location.findFirst.mockClear()
      expect(await codeOf(service.get('tch', 'acme', 'sede', 'x'))).toBe('LOCATION_NOT_FOUND')
      expect(db.location.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    const input = { name: 'Sala 101', type: 'CLASSROOM' as const, capacity: 40 }

    it.each([
      ['dono', { isOwner: true }],
      ['responsável', { isManager: true }],
    ])('%s cria, na unidade', async (_label, role) => {
      tenants.resolveUnit.mockResolvedValue(access(role))
      await expect(service.create('u', 'acme', 'sede', input)).resolves.toBeDefined()
      expect(tenants.assertWritable).toHaveBeenCalled()
      expect(db.location.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ...input, unitId: 'unit-1' } }),
      )
    })

    it('coordenador ou professor dá NOT_ALLOWED antes de assertWritable', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      expect(await codeOf(service.create('tch', 'acme', 'sede', input))).toBe('NOT_ALLOWED')
      expect(tenants.assertWritable).not.toHaveBeenCalled()
    })

    it('plano vencido barra', async () => {
      tenants.assertWritable.mockRejectedValue(new AppException('PLAN_EXPIRED'))
      expect(await codeOf(service.create('mgr', 'acme', 'sede', input))).toBe('PLAN_EXPIRED')
      expect(db.location.create).not.toHaveBeenCalled()
    })

    it('nome usado na unidade dá LOCATION_NAME_IN_USE, também pelo P2002', async () => {
      db.location.findUnique.mockResolvedValue({ id: 'outro' })
      expect(await codeOf(service.create('mgr', 'acme', 'sede', input))).toBe(
        'LOCATION_NAME_IN_USE',
      )
      expect(db.location.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId_name: { unitId: 'unit-1', name: 'Sala 101' } } }),
      )

      db.location.findUnique.mockResolvedValue(null)
      db.location.create.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.create('mgr', 'acme', 'sede', input))).toBe(
        'LOCATION_NAME_IN_USE',
      )
    })
  })

  describe('update', () => {
    it('edita; capacity: null limpa', async () => {
      await service.update('mgr', 'acme', 'sede', LOCATION_ID, { capacity: null })
      expect(db.location.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LOCATION_ID }, data: { capacity: null } }),
      )
    })

    it('sem papel dá NOT_ALLOWED', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      expect(await codeOf(service.update('tch', 'acme', 'sede', LOCATION_ID, { name: 'X' }))).toBe(
        'NOT_ALLOWED',
      )
      expect(db.location.update).not.toHaveBeenCalled()
    })

    it('desativado dá LOCATION_INACTIVE; { isActive: true } reativa', async () => {
      db.location.findFirst.mockResolvedValue(location({ isActive: false }))
      expect(await codeOf(service.update('mgr', 'acme', 'sede', LOCATION_ID, { name: 'Z' }))).toBe(
        'LOCATION_INACTIVE',
      )
      await expect(
        service.update('mgr', 'acme', 'sede', LOCATION_ID, { isActive: true }),
      ).resolves.toBeDefined()
    })

    it('nome de outro local da unidade dá 409; o próprio passa', async () => {
      db.location.findUnique.mockResolvedValue({ id: LOCATION_ID })
      await expect(
        service.update('mgr', 'acme', 'sede', LOCATION_ID, { name: 'Lab. de Redes' }),
      ).resolves.toBeDefined()
      db.location.findUnique.mockResolvedValue({ id: 'outro' })
      expect(
        await codeOf(service.update('mgr', 'acme', 'sede', LOCATION_ID, { name: 'Sala 101' })),
      ).toBe('LOCATION_NAME_IN_USE')
    })
  })

  describe('remove', () => {
    it('apaga sem uso, inclusive desativado', async () => {
      db.location.findFirst.mockResolvedValue(location({ isActive: false }))
      await expect(service.remove('mgr', 'acme', 'sede', LOCATION_ID)).resolves.toBeUndefined()
      expect(tenants.assertWritable).toHaveBeenCalled()
      expect(db.location.delete).toHaveBeenCalledWith({ where: { id: LOCATION_ID } })
    })

    it('sem papel dá NOT_ALLOWED', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      expect(await codeOf(service.remove('tch', 'acme', 'sede', LOCATION_ID))).toBe('NOT_ALLOWED')
      expect(db.location.delete).not.toHaveBeenCalled()
    })

    it('alocado em célula dá LOCATION_IN_USE', async () => {
      db.location.findFirst.mockResolvedValue(location({ _count: { boardSlots: 1 } }))
      expect(await codeOf(service.remove('mgr', 'acme', 'sede', LOCATION_ID))).toBe(
        'LOCATION_IN_USE',
      )
      expect(db.location.delete).not.toHaveBeenCalled()
    })

    it('o P2003 em corrida vira LOCATION_IN_USE', async () => {
      db.location.delete.mockRejectedValue(prismaError('P2003'))
      expect(await codeOf(service.remove('mgr', 'acme', 'sede', LOCATION_ID))).toBe(
        'LOCATION_IN_USE',
      )
    })
  })
})
