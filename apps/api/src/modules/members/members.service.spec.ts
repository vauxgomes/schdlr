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
  createdAt: new Date('2026-10-29T22:00:00.000Z'),
  user: { email: 'teacher@schdlr.dev', name: 'Teacher', teacherProfiles: [] as { id: string }[] },
  ...overrides,
})

const access = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', organizationId: 'org-1', isActive: true },
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
  let db: {
    $transaction: jest.Mock
    course: { updateMany: jest.Mock }
    unitMember: Record<'findMany' | 'findUnique' | 'update' | 'delete', jest.Mock>
  }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let service: MembersService

  beforeEach(() => {
    db = {
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
      course: { updateMany: jest.fn() },
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

  it('list devolve o formato da spec, por nome; isTeacher vem do Teacher ativo (0021)', async () => {
    tenants.resolveUnit.mockResolvedValue(access())
    const teacher = { email: 'teacher@schdlr.dev', name: 'Teacher', teacherProfiles: [{ id: 't' }] }
    db.unitMember.findMany.mockResolvedValue([member(), member({ user: teacher })])
    await expect(service.list('u', 'acme', 'sede')).resolves.toEqual([
      {
        userId: 'target',
        email: 'teacher@schdlr.dev',
        name: 'Teacher',
        isManager: false,
        isTeacher: false,
        createdAt: new Date('2026-10-29T22:00:00.000Z'),
      },
      expect.objectContaining({ isTeacher: true }),
    ])
    expect(db.unitMember.findMany).toHaveBeenCalledWith({
      where: { unitId: 'unit-1' },
      include: {
        user: {
          select: {
            email: true,
            name: true,
            teacherProfiles: {
              where: { organizationId: 'org-1', isActive: true },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    })
  })

  describe('update', () => {
    beforeEach(() => {
      db.unitMember.findUnique.mockResolvedValue(member())
      db.unitMember.update.mockResolvedValue(member({ isManager: true }))
    })

    it('dono muda isManager', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isOwner: true }))
      await expect(
        service.update('u', 'acme', 'sede', 'target', { isManager: true }),
      ).resolves.toMatchObject({ isManager: true })
      expect(tenants.assertWritable).toHaveBeenCalled()
      expect(db.unitMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm-1' }, data: { isManager: true } }),
      )
    })

    it.each([
      ['responsável com isManager, mesmo sem mudar', { isManager: true }],
      ['membro sem papel', {}],
    ])('%s dá NOT_ALLOWED', async (_label, role) => {
      tenants.resolveUnit.mockResolvedValue(access(role))
      expect(
        await codeOf(service.update('u', 'acme', 'sede', 'target', { isManager: false })),
      ).toBe('NOT_ALLOWED')
      expect(db.unitMember.update).not.toHaveBeenCalled()
    })

    it('quem não é membro dá MEMBER_NOT_FOUND', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isOwner: true }))
      db.unitMember.findUnique.mockResolvedValue(null)
      expect(await codeOf(service.update('u', 'acme', 'sede', 'x', { isManager: true }))).toBe(
        'MEMBER_NOT_FOUND',
      )
    })

    it('plano vencido não grava', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isOwner: true }))
      tenants.assertWritable.mockRejectedValue(new PlanExpiredException())
      await expect(
        service.update('u', 'acme', 'sede', 'target', { isManager: true }),
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

    it('quem sai deixa de coordenar os cursos, na mesma transação, e não sai das ofertas', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isOwner: true }))
      db.unitMember.findUnique.mockResolvedValue(member())
      db.course.updateMany.mockReturnValue('courses')
      db.unitMember.delete.mockReturnValue('delete')
      await service.remove('owner', 'acme', 'sede', 'target')
      expect(db.course.updateMany).toHaveBeenCalledWith({
        where: { unitId: 'unit-1', coordinatorId: 'target' },
        data: { coordinatorId: null },
      })
      // Continua professor da organização: o Teacher e as ofertas ficam (0021).
      expect(db.$transaction).toHaveBeenCalledWith(['courses', 'delete'])
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
