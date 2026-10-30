import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { PlanExpiredException } from '@modules/subscriptions/plan-expired.exception'
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service'

import { OrganizationAccess, TenantAccessService, UnitAccess } from './tenant-access.service'

const organization = (overrides: Record<string, unknown> = {}) => ({
  id: 'org-1',
  slug: 'acme',
  ownerId: 'owner',
  isActive: true,
  ...overrides,
})
const unit = (overrides: Record<string, unknown> = {}) => ({
  id: 'unit-1',
  slug: 'sede',
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

describe('TenantAccessService', () => {
  let db: {
    organization: { findUnique: jest.Mock }
    unit: { findUnique: jest.Mock }
    unitMember: { findFirst: jest.Mock; findUnique: jest.Mock }
  }
  let subscriptions: { getActivePlan: jest.Mock }
  let service: TenantAccessService

  beforeEach(() => {
    db = {
      organization: { findUnique: jest.fn() },
      unit: { findUnique: jest.fn() },
      unitMember: { findFirst: jest.fn(), findUnique: jest.fn() },
    }
    subscriptions = { getActivePlan: jest.fn() }
    service = new TenantAccessService(
      db as unknown as DatabaseService,
      subscriptions as unknown as SubscriptionsService,
    )
  })

  describe('resolveOrganization', () => {
    it('o dono enxerga, mesmo desativada, sem consultar membros', async () => {
      db.organization.findUnique.mockResolvedValue(organization({ isActive: false }))
      await expect(service.resolveOrganization('owner', 'Acme')).resolves.toMatchObject({
        isOwner: true,
      })
      expect(db.organization.findUnique).toHaveBeenCalledWith({ where: { slug: 'acme' } })
      expect(db.unitMember.findFirst).not.toHaveBeenCalled()
    })

    it('membro de unidade ativa enxerga', async () => {
      db.organization.findUnique.mockResolvedValue(organization())
      db.unitMember.findFirst.mockResolvedValue({ id: 'm' })
      await expect(service.resolveOrganization('u', 'acme')).resolves.toMatchObject({
        isOwner: false,
      })
      expect(db.unitMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u', unit: { organizationId: 'org-1', isActive: true } },
        }),
      )
    })

    it.each([
      ['slug inexistente', null, { id: 'm' }],
      ['não membro', organization(), null],
      ['organização desativada para o membro', organization({ isActive: false }), { id: 'm' }],
    ])('%s dá 404', async (_label, found, member) => {
      db.organization.findUnique.mockResolvedValue(found)
      db.unitMember.findFirst.mockResolvedValue(member)
      expect(await codeOf(service.resolveOrganization('u', 'acme'))).toBe('ORGANIZATION_NOT_FOUND')
    })

    it('slug fora do formato dá 404 sem consultar o banco', async () => {
      expect(await codeOf(service.resolveOrganization('u', 'não_é slug'))).toBe(
        'ORGANIZATION_NOT_FOUND',
      )
      expect(db.organization.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('resolveUnit', () => {
    beforeEach(() => db.unitMember.findFirst.mockResolvedValue({ id: 'm' }))

    it('membro recebe o papel', async () => {
      db.organization.findUnique.mockResolvedValue(organization())
      db.unit.findUnique.mockResolvedValue(unit())
      db.unitMember.findUnique.mockResolvedValue({ isManager: true, isTeacher: false })
      await expect(service.resolveUnit('u', 'acme', 'sede')).resolves.toMatchObject({
        isOwner: false,
        isManager: true,
        isTeacher: false,
      })
    })

    it('o dono enxerga unidade desativada, sem ser membro', async () => {
      db.organization.findUnique.mockResolvedValue(organization())
      db.unit.findUnique.mockResolvedValue(unit({ isActive: false }))
      db.unitMember.findUnique.mockResolvedValue(null)
      await expect(service.resolveUnit('owner', 'acme', 'sede')).resolves.toMatchObject({
        isOwner: true,
        membership: null,
        isManager: false,
      })
    })

    it.each([
      ['unidade inexistente', null, { isManager: true }],
      ['não membro da unidade', unit(), null],
      ['unidade desativada para o membro', unit({ isActive: false }), { isManager: true }],
    ])('%s dá 404', async (_label, found, membership) => {
      db.organization.findUnique.mockResolvedValue(organization())
      db.unit.findUnique.mockResolvedValue(found)
      db.unitMember.findUnique.mockResolvedValue(membership)
      expect(await codeOf(service.resolveUnit('u', 'acme', 'sede'))).toBe('UNIT_NOT_FOUND')
    })

    it('slug de unidade fora do formato dá 404', async () => {
      db.organization.findUnique.mockResolvedValue(organization())
      expect(await codeOf(service.resolveUnit('u', 'acme', 'x'))).toBe('UNIT_NOT_FOUND')
      expect(db.unit.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('assertWritable', () => {
    const orgAccess = (isActive = true) =>
      ({ organization: organization({ isActive }), isOwner: true }) as OrganizationAccess
    const unitAccess = (orgActive = true, unitActive = true) =>
      ({ ...orgAccess(orgActive), unit: unit({ isActive: unitActive }) }) as UnitAccess

    beforeEach(() => subscriptions.getActivePlan.mockResolvedValue({ status: 'ACTIVE' }))

    it('passa com tudo ativo e lê o plano do dono', async () => {
      await expect(service.assertWritable(unitAccess())).resolves.toBeUndefined()
      expect(subscriptions.getActivePlan).toHaveBeenCalledWith('owner')
    })

    it('organização desativada vem antes de unidade desativada', async () => {
      expect(await codeOf(service.assertWritable(unitAccess(false, false)))).toBe(
        'ORGANIZATION_INACTIVE',
      )
      expect(await codeOf(service.assertWritable(unitAccess(true, false)))).toBe('UNIT_INACTIVE')
    })

    it.each([
      ['vencido', { status: 'EXPIRED' }],
      ['ausente', null],
    ])('plano do dono %s dá PLAN_EXPIRED', async (_label, plan) => {
      subscriptions.getActivePlan.mockResolvedValue(plan)
      const error = await service.assertWritable(orgAccess()).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(PlanExpiredException)
    })

    it('reativar dispensa só o 409 da própria entidade', async () => {
      await expect(
        service.assertWritable(orgAccess(false), { reactivating: true }),
      ).resolves.toBeUndefined()
      await expect(
        service.assertWritable(unitAccess(true, false), { reactivating: true }),
      ).resolves.toBeUndefined()
      expect(
        await codeOf(service.assertWritable(unitAccess(false, false), { reactivating: true })),
      ).toBe('ORGANIZATION_INACTIVE')

      subscriptions.getActivePlan.mockResolvedValue({ status: 'EXPIRED' })
      const error = await service
        .assertWritable(orgAccess(false), { reactivating: true })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(PlanExpiredException)
    })
  })
})
