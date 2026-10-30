import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service'

import { TenantAccessService } from './tenant-access.service'
import { UnitsService } from './units.service'

const organization = { id: 'org-1', name: 'Acme', slug: 'acme', ownerId: 'owner', isActive: true }
const unit = (overrides: Record<string, unknown> = {}) => ({
  id: 'unit-1',
  organizationId: 'org-1',
  name: 'Sede',
  slug: 'sede',
  address: null,
  isActive: true,
  ...overrides,
})

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('UnitsService', () => {
  let tx: { $queryRaw: jest.Mock; unit: Record<'count' | 'findUnique' | 'create', jest.Mock> }
  let db: { $transaction: jest.Mock; unit: Record<'findMany' | 'update', jest.Mock> }
  let tenants: Record<'resolveOrganization' | 'resolveUnit' | 'assertWritable', jest.Mock>
  let subscriptions: { getActivePlan: jest.Mock }
  let service: UnitsService

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      unit: { count: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    }
    db = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      unit: { findMany: jest.fn(), update: jest.fn() },
    }
    tenants = { resolveOrganization: jest.fn(), resolveUnit: jest.fn(), assertWritable: jest.fn() }
    subscriptions = {
      getActivePlan: jest.fn().mockResolvedValue({ limits: { unitsPerOrganization: 1 } }),
    }
    service = new UnitsService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
      subscriptions as unknown as SubscriptionsService,
    )
  })

  describe('create', () => {
    const input = { name: 'Sede', slug: 'sede', address: null }

    beforeEach(() => {
      tenants.resolveOrganization.mockResolvedValue({ organization, isOwner: true })
      tx.unit.count.mockResolvedValue(0)
      tx.unit.findUnique.mockResolvedValue(null)
      tx.unit.create.mockResolvedValue(unit())
    })

    it('o dono cria, com a organização travada, e não vira membro', async () => {
      await expect(service.create('owner', 'acme', input)).resolves.toMatchObject({
        slug: 'sede',
        organization: { name: 'Acme', slug: 'acme' },
        access: { isOwner: true, isManager: false, isTeacher: false },
      })
      const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray]
      expect(sql.join('?')).toBe('SELECT id FROM organizations WHERE id = ? FOR UPDATE')
      expect(tx.unit.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } })
      expect(tx.unit.create).toHaveBeenCalledWith({ data: { ...input, organizationId: 'org-1' } })
      expect(subscriptions.getActivePlan).toHaveBeenCalledWith('owner')
    })

    it('quem não é dono dá NOT_ALLOWED antes de assertWritable', async () => {
      tenants.resolveOrganization.mockResolvedValue({ organization, isOwner: false })
      expect(await codeOf(service.create('u', 'acme', input))).toBe('NOT_ALLOWED')
      expect(tenants.assertWritable).not.toHaveBeenCalled()
    })

    it('no limite dá PLAN_LIMIT_REACHED com params', async () => {
      tx.unit.count.mockResolvedValue(1)
      const error = (await service
        .create('owner', 'acme', input)
        .catch((e: unknown) => e)) as AppException
      expect(error.code).toBe('PLAN_LIMIT_REACHED')
      expect(error.params).toEqual({ limit: 'unitsPerOrganization', max: 1 })
      expect(tx.unit.create).not.toHaveBeenCalled()
    })

    it('limite null é ilimitado', async () => {
      subscriptions.getActivePlan.mockResolvedValue({ limits: { unitsPerOrganization: null } })
      tx.unit.count.mockResolvedValue(99)
      await expect(service.create('owner', 'acme', input)).resolves.toBeDefined()
    })

    it('slug usado na organização dá SLUG_ALREADY_IN_USE', async () => {
      tx.unit.findUnique.mockResolvedValue({ id: 'outra' })
      expect(await codeOf(service.create('owner', 'acme', input))).toBe('SLUG_ALREADY_IN_USE')
      expect(tx.unit.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId_slug: { organizationId: 'org-1', slug: 'sede' } },
        }),
      )
    })
  })

  describe('update', () => {
    const access = (role: { isOwner?: boolean; isManager?: boolean }) => ({
      organization,
      unit: unit(),
      membership: role.isManager ? { isManager: true, isTeacher: false } : null,
      isOwner: false,
      isManager: false,
      isTeacher: false,
      ...role,
    })

    beforeEach(() => db.unit.update.mockResolvedValue(unit()))

    it.each([
      ['responsável edita nome', { isManager: true }, { name: 'X' }],
      ['dono desativa', { isOwner: true }, { isActive: false }],
    ])('%s', async (_label, role, body) => {
      tenants.resolveUnit.mockResolvedValue(access(role))
      await expect(service.update('u', 'acme', 'sede', body)).resolves.toBeDefined()
      expect(db.unit.update).toHaveBeenCalledWith({ where: { id: 'unit-1' }, data: body })
    })

    it.each([
      ['responsável com isActive', { isManager: true }, { isActive: true }],
      ['membro sem papel', {}, { name: 'X' }],
    ])('%s dá NOT_ALLOWED', async (_label, role, body) => {
      tenants.resolveUnit.mockResolvedValue(access(role))
      expect(await codeOf(service.update('u', 'acme', 'sede', body))).toBe('NOT_ALLOWED')
      expect(db.unit.update).not.toHaveBeenCalled()
    })

    it('só isActive: true é reativação', async () => {
      const owner = access({ isOwner: true })
      tenants.resolveUnit.mockResolvedValue(owner)
      await service.update('owner', 'acme', 'sede', { isActive: true })
      expect(tenants.assertWritable).toHaveBeenLastCalledWith(owner, { reactivating: true })
      await service.update('owner', 'acme', 'sede', { name: 'X' })
      expect(tenants.assertWritable).toHaveBeenLastCalledWith(owner, { reactivating: false })
    })
  })

  describe('list', () => {
    it('o dono vê todas', async () => {
      tenants.resolveOrganization.mockResolvedValue({ organization, isOwner: true })
      db.unit.findMany.mockResolvedValue([{ ...unit({ isActive: false }), members: [] }])
      const [view] = await service.list('owner', 'acme')
      expect(view.access).toEqual({ isOwner: true, isManager: false, isTeacher: false })
      expect(db.unit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' }, orderBy: { name: 'asc' } }),
      )
    })

    it('o membro vê as ativas de que é membro, com o papel', async () => {
      tenants.resolveOrganization.mockResolvedValue({ organization, isOwner: false })
      db.unit.findMany.mockResolvedValue([
        { ...unit(), members: [{ isManager: false, isTeacher: true }] },
      ])
      const [view] = await service.list('u', 'acme')
      expect(view.access).toEqual({ isOwner: false, isManager: false, isTeacher: true })
      expect(db.unit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', isActive: true, members: { some: { userId: 'u' } } },
        }),
      )
    })
  })
})
