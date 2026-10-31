import { Prisma, TermStatus } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import { TermAccessService } from './term-access.service'
import { TermsService } from './terms.service'

const unitAccess = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})
const term = (overrides: Record<string, unknown> = {}) => ({
  id: 'term-1',
  unitId: 'unit-1',
  name: '2026.1',
  startDate: new Date('2026-02-02T00:00:00.000Z'),
  endDate: new Date('2026-07-04T00:00:00.000Z'),
  status: 'PLANNING',
  createdById: 'mgr',
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T10:00:00.000Z'),
  createdBy: { id: 'mgr', email: 'manager@schdlr.dev', name: 'Manager Teste' },
  _count: { projects: 0 },
  ...overrides,
})
const termAccess = (status: TermStatus = 'PLANNING', canManageTerm = true) => ({
  ...unitAccess({ isManager: canManageTerm }),
  term: term({ status }),
  canManageTerm,
})
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

describe('TermsService', () => {
  let db: {
    term: Record<
      'findMany' | 'findUnique' | 'findUniqueOrThrow' | 'create' | 'update' | 'delete',
      jest.Mock
    >
    project: { count: jest.Mock }
  }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let terms: Record<'resolveTerm' | 'assertTermWritable', jest.Mock>
  let service: TermsService

  beforeEach(() => {
    db = {
      term: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(term()),
        create: jest.fn().mockResolvedValue(term()),
        update: jest.fn(),
        delete: jest.fn(),
      },
      project: { count: jest.fn().mockResolvedValue(0) },
    }
    tenants = {
      resolveUnit: jest.fn().mockResolvedValue(unitAccess({ isManager: true })),
      assertWritable: jest.fn(),
    }
    terms = {
      resolveTerm: jest.fn().mockResolvedValue(termAccess()),
      assertTermWritable: jest.fn(),
    }
    service = new TermsService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
      terms as unknown as TermAccessService,
    )
  })

  describe('list', () => {
    it('todos da unidade, mais recentes primeiro, no formato da spec', async () => {
      tenants.resolveUnit.mockResolvedValue(unitAccess())
      db.term.findMany.mockResolvedValue([term({ status: 'STARTED', _count: { projects: 2 } })])
      await expect(service.list('tch', 'acme', 'sede', {})).resolves.toEqual([
        {
          id: 'term-1',
          name: '2026.1',
          startDate: '2026-02-02',
          endDate: '2026-07-04',
          status: 'STARTED',
          nextStatuses: ['ADJUSTMENTS', 'FINISHED', 'CANCELLED'],
          createdAt: new Date('2026-10-31T10:00:00.000Z'),
          updatedAt: new Date('2026-10-31T10:00:00.000Z'),
          createdBy: { id: 'mgr', email: 'manager@schdlr.dev', name: 'Manager Teste' },
          projectsCount: 2,
          access: { canManageTerm: false },
        },
      ])
      expect(db.term.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { unitId: 'unit-1' },
          orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
        }),
      )
    })

    it('?status= filtra', async () => {
      db.term.findMany.mockResolvedValue([])
      await service.list('tch', 'acme', 'sede', { status: 'FINISHED' })
      expect(db.term.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId: 'unit-1', status: 'FINISHED' } }),
      )
    })
  })

  describe('create', () => {
    const input = { name: '2026.1', startDate: '2026-02-02', endDate: '2026-07-04' }

    it('o responsável cria, em PLANNING, com as datas à meia-noite UTC', async () => {
      await expect(service.create('mgr', 'acme', 'sede', input)).resolves.toMatchObject({
        status: 'PLANNING',
        nextStatuses: ['ADJUSTMENTS', 'CANCELLED'],
        startDate: '2026-02-02',
      })
      expect(tenants.assertWritable).toHaveBeenCalled()
      expect(db.term.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: '2026.1',
            startDate: new Date('2026-02-02T00:00:00.000Z'),
            endDate: new Date('2026-07-04T00:00:00.000Z'),
            unitId: 'unit-1',
            createdById: 'mgr',
          },
        }),
      )
    })

    it('coordenador ou professor dá NOT_ALLOWED antes de assertWritable', async () => {
      tenants.resolveUnit.mockResolvedValue(unitAccess())
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe('NOT_ALLOWED')
      expect(tenants.assertWritable).not.toHaveBeenCalled()
    })

    it('nome usado na unidade dá TERM_NAME_IN_USE, também pelo P2002', async () => {
      db.term.findUnique.mockResolvedValue({ id: 'outro' })
      expect(await codeOf(service.create('mgr', 'acme', 'sede', input))).toBe('TERM_NAME_IN_USE')
      expect(db.term.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId_name: { unitId: 'unit-1', name: '2026.1' } } }),
      )
      db.term.findUnique.mockResolvedValue(null)
      db.term.create.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.create('mgr', 'acme', 'sede', input))).toBe('TERM_NAME_IN_USE')
    })
  })

  describe('update', () => {
    it('edita, passando pelo assertTermWritable', async () => {
      await service.update('mgr', 'acme', 'sede', 'term-1', { name: '2026.2' })
      expect(terms.assertTermWritable).toHaveBeenCalledWith(termAccess())
      expect(db.term.update).toHaveBeenCalledWith({
        where: { id: 'term-1' },
        data: { name: '2026.2' },
      })
    })

    it('sem papel dá NOT_ALLOWED', async () => {
      terms.resolveTerm.mockResolvedValue(termAccess('PLANNING', false))
      expect(await codeOf(service.update('crd', 'acme', 'sede', 'term-1', { name: 'X' }))).toBe(
        'NOT_ALLOWED',
      )
      expect(terms.assertTermWritable).not.toHaveBeenCalled()
    })

    it('fechado dá TERM_CLOSED', async () => {
      terms.assertTermWritable.mockRejectedValue(new AppException('TERM_CLOSED'))
      expect(await codeOf(service.update('mgr', 'acme', 'sede', 'term-1', { name: 'X' }))).toBe(
        'TERM_CLOSED',
      )
      expect(db.term.update).not.toHaveBeenCalled()
    })

    it.each([
      ['fim antes do início que fica', { endDate: '2026-01-01' }],
      ['início depois do fim que fica', { startDate: '2026-08-01' }],
    ])('%s dá END_BEFORE_START', async (_label, body) => {
      const error = await errorOf(service.update('mgr', 'acme', 'sede', 'term-1', body))
      expect(error.code).toBe('VALIDATION_FAILED')
      expect(error.errors).toEqual([
        {
          path: 'endDate',
          code: 'END_BEFORE_START',
          message: 'End date must not be before start date',
        },
      ])
      expect(db.term.update).not.toHaveBeenCalled()
    })

    it('uma data só, coerente com a outra, passa', async () => {
      await service.update('mgr', 'acme', 'sede', 'term-1', { endDate: '2026-07-31' })
      expect(db.term.update).toHaveBeenCalledWith({
        where: { id: 'term-1' },
        data: { endDate: new Date('2026-07-31T00:00:00.000Z') },
      })
    })

    it('nome de outro semestre dá 409; o próprio passa', async () => {
      db.term.findUnique.mockResolvedValue({ id: 'term-1' })
      await expect(
        service.update('mgr', 'acme', 'sede', 'term-1', { name: '2026.1' }),
      ).resolves.toBeDefined()
      db.term.findUnique.mockResolvedValue({ id: 'outro' })
      expect(
        await codeOf(service.update('mgr', 'acme', 'sede', 'term-1', { name: '2025.2' })),
      ).toBe('TERM_NAME_IN_USE')
    })
  })

  describe('changeStatus', () => {
    const ALL = ['PLANNING', 'ADJUSTMENTS', 'STARTED', 'FINISHED', 'CANCELLED'] as const
    const ALLOWED = new Set([
      'PLANNING>ADJUSTMENTS',
      'PLANNING>CANCELLED',
      'ADJUSTMENTS>PLANNING',
      'ADJUSTMENTS>STARTED',
      'ADJUSTMENTS>CANCELLED',
      'STARTED>ADJUSTMENTS',
      'STARTED>FINISHED',
      'STARTED>CANCELLED',
    ])
    const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const))

    it.each(pairs)('%s → %s', async (from, to) => {
      terms.resolveTerm.mockResolvedValue(termAccess(from))
      const run = service.changeStatus('mgr', 'acme', 'sede', 'term-1', { status: to })
      if (ALLOWED.has(`${from}>${to}`)) {
        await expect(run).resolves.toBeDefined()
        expect(db.term.update).toHaveBeenCalledWith({
          where: { id: 'term-1' },
          data: { status: to },
        })
      } else {
        const error = await errorOf(run)
        expect(error.code).toBe('INVALID_TERM_TRANSITION')
        expect(error.params).toEqual({ from, to })
        expect(db.term.update).not.toHaveBeenCalled()
      }
    })

    it('papel antes de assertWritable, e assertWritable antes da transição', async () => {
      terms.resolveTerm.mockResolvedValue(termAccess('PLANNING', false))
      expect(
        await codeOf(service.changeStatus('crd', 'acme', 'sede', 'term-1', { status: 'STARTED' })),
      ).toBe('NOT_ALLOWED')
      expect(tenants.assertWritable).not.toHaveBeenCalled()

      terms.resolveTerm.mockResolvedValue(termAccess('PLANNING'))
      tenants.assertWritable.mockRejectedValue(new AppException('PLAN_EXPIRED'))
      expect(
        await codeOf(service.changeStatus('mgr', 'acme', 'sede', 'term-1', { status: 'STARTED' })),
      ).toBe('PLAN_EXPIRED')
    })
  })

  describe('remove', () => {
    it.each(['PLANNING', 'CANCELLED', 'FINISHED'] as const)(
      'apaga sem projeto, em %s',
      async (status) => {
        terms.resolveTerm.mockResolvedValue(termAccess(status))
        await expect(service.remove('mgr', 'acme', 'sede', 'term-1')).resolves.toBeUndefined()
        expect(tenants.assertWritable).toHaveBeenCalled()
        expect(terms.assertTermWritable).not.toHaveBeenCalled()
        expect(db.project.count).toHaveBeenCalledWith({ where: { termId: 'term-1' } })
        expect(db.term.delete).toHaveBeenCalledWith({ where: { id: 'term-1' } })
      },
    )

    it('sem papel dá NOT_ALLOWED', async () => {
      terms.resolveTerm.mockResolvedValue(termAccess('PLANNING', false))
      expect(await codeOf(service.remove('crd', 'acme', 'sede', 'term-1'))).toBe('NOT_ALLOWED')
      expect(db.term.delete).not.toHaveBeenCalled()
    })

    it('com projeto dá TERM_IN_USE; o P2003 em corrida também', async () => {
      db.project.count.mockResolvedValue(1)
      expect(await codeOf(service.remove('mgr', 'acme', 'sede', 'term-1'))).toBe('TERM_IN_USE')
      expect(db.term.delete).not.toHaveBeenCalled()

      db.project.count.mockResolvedValue(0)
      db.term.delete.mockRejectedValue(prismaError('P2003'))
      expect(await codeOf(service.remove('mgr', 'acme', 'sede', 'term-1'))).toBe('TERM_IN_USE')
    })
  })
})
