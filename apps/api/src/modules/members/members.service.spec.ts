import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { PlanExpiredException } from '@modules/subscriptions/plan-expired.exception'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import { MembersService } from './members.service'

const member = (overrides: Record<string, unknown> = {}) => ({
  id: 'm-1',
  unitId: 'unit-1',
  userId: 'target',
  isManager: false,
  isTeacher: false,
  createdAt: new Date('2026-10-29T22:00:00.000Z'),
  user: { email: 'teacher@schdlr.dev', name: 'Teacher' },
  ...overrides,
})

const access = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('MembersService', () => {
  let db: { unitMember: Record<'findMany' | 'findUnique' | 'update' | 'delete', jest.Mock> }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let service: MembersService

  beforeEach(() => {
    db = {
      unitMember: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    }
    tenants = { resolveUnit: jest.fn(), assertWritable: jest.fn() }
    service = new MembersService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
    )
  })

  it('list devolve o formato da spec, por nome', async () => {
    tenants.resolveUnit.mockResolvedValue(access())
    db.unitMember.findMany.mockResolvedValue([member()])
    await expect(service.list('u', 'acme', 'sede')).resolves.toEqual([
      {
        userId: 'target',
        email: 'teacher@schdlr.dev',
        name: 'Teacher',
        isManager: false,
        isTeacher: false,
        createdAt: new Date('2026-10-29T22:00:00.000Z'),
      },
    ])
    expect(db.unitMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unitId: 'unit-1' }, orderBy: { user: { name: 'asc' } } }),
    )
  })

  describe('update', () => {
    beforeEach(() => {
      db.unitMember.findUnique.mockResolvedValue(member())
      db.unitMember.update.mockResolvedValue(member({ isTeacher: true }))
    })

    it.each([
      ['dono muda isManager', { isOwner: true }, { isManager: true }],
      ['responsável muda isTeacher', { isManager: true }, { isTeacher: true }],
    ])('%s', async (_label, role, body) => {
      tenants.resolveUnit.mockResolvedValue(access(role))
      await expect(service.update('u', 'acme', 'sede', 'target', body)).resolves.toBeDefined()
      expect(tenants.assertWritable).toHaveBeenCalled()
      expect(db.unitMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm-1' }, data: body }),
      )
    })

    it.each([
      ['responsável com isManager, mesmo sem mudar', { isManager: true }, { isManager: false }],
      ['membro sem papel', {}, { isTeacher: true }],
    ])('%s dá NOT_ALLOWED', async (_label, role, body) => {
      tenants.resolveUnit.mockResolvedValue(access(role))
      expect(await codeOf(service.update('u', 'acme', 'sede', 'target', body))).toBe('NOT_ALLOWED')
      expect(db.unitMember.update).not.toHaveBeenCalled()
    })

    it('quem não é membro dá MEMBER_NOT_FOUND', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isOwner: true }))
      db.unitMember.findUnique.mockResolvedValue(null)
      expect(await codeOf(service.update('u', 'acme', 'sede', 'x', { isTeacher: true }))).toBe(
        'MEMBER_NOT_FOUND',
      )
    })

    it('plano vencido não grava', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isOwner: true }))
      tenants.assertWritable.mockRejectedValue(new PlanExpiredException())
      await expect(
        service.update('u', 'acme', 'sede', 'target', { isTeacher: true }),
      ).rejects.toBeInstanceOf(PlanExpiredException)
      expect(db.unitMember.update).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it.each([
      ['dono remove responsável', 'owner', { isOwner: true }, { isManager: true }],
      ['responsável remove membro', 'mgr', { isManager: true }, {}],
      ['membro sai', 'target', {}, {}],
      ['responsável sai', 'target', { isManager: true }, { isManager: true }],
    ])('%s', async (_label, caller, role, target) => {
      tenants.resolveUnit.mockResolvedValue(access(role))
      db.unitMember.findUnique.mockResolvedValue(member(target))
      await expect(service.remove(caller, 'acme', 'sede', 'target')).resolves.toBeUndefined()
      expect(tenants.assertWritable).toHaveBeenCalled()
      expect(db.unitMember.delete).toHaveBeenCalledWith({ where: { id: 'm-1' } })
    })

    it.each([
      ['responsável remove responsável', { isManager: true }, { isManager: true }],
      ['membro remove outro', {}, {}],
    ])('%s dá NOT_ALLOWED', async (_label, role, target) => {
      tenants.resolveUnit.mockResolvedValue(access(role))
      db.unitMember.findUnique.mockResolvedValue(member(target))
      expect(await codeOf(service.remove('caller', 'acme', 'sede', 'target'))).toBe('NOT_ALLOWED')
      expect(db.unitMember.delete).not.toHaveBeenCalled()
    })
  })
})
