import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { PlanExpiredException } from '@modules/subscriptions/plan-expired.exception'

import { OrganizationsService } from './organizations.service'
import { TenantAccessService } from './tenant-access.service'

const owner = { id: 'user-1', email: 'admin@schdlr.dev', name: 'Admin' }
const stored = (overrides: Record<string, unknown> = {}) => ({
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  address: null,
  ownerId: 'user-1',
  isActive: true,
  owner,
  ...overrides,
})
const future = new Date(Date.now() + 86_400_000)
const past = new Date(Date.now() - 86_400_000)

async function appError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  const exception = error as AppException
  return { status: exception.getStatus(), code: exception.code, params: exception.params }
}

describe('OrganizationsService', () => {
  let tx: {
    $queryRaw: jest.Mock
    organization: Record<'count' | 'findUnique' | 'create', jest.Mock>
  }
  let db: {
    $transaction: jest.Mock
    organization: Record<'findMany' | 'findUniqueOrThrow' | 'update', jest.Mock>
  }
  let tenants: Record<'resolveOrganization' | 'assertWritable', jest.Mock>
  let service: OrganizationsService

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      organization: { count: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    }
    db = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      organization: { findMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    }
    tenants = { resolveOrganization: jest.fn(), assertWritable: jest.fn() }
    service = new OrganizationsService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
    )
  })

  describe('create', () => {
    const input = { name: 'Nova', slug: 'nova', address: null }

    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue([{ plan: 'TRIAL', expiresAt: future }])
      tx.organization.count.mockResolvedValue(0)
      tx.organization.findUnique.mockResolvedValue(null)
      tx.organization.create.mockResolvedValue(stored({ slug: 'nova' }))
    })

    it('cria com quem chamou como dono, na transação com a assinatura travada', async () => {
      await expect(service.create('user-1', input)).resolves.toEqual({
        id: 'org-1',
        name: 'Acme',
        slug: 'nova',
        address: null,
        isActive: true,
        owner,
        access: { isOwner: true },
      })
      const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray]
      expect(sql.join('?')).toMatch(/FROM subscriptions\s+WHERE user_id = \? FOR UPDATE/)
      expect(tx.organization.count).toHaveBeenCalledWith({ where: { ownerId: 'user-1' } })
      expect(tx.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ...input, ownerId: 'user-1' } }),
      )
    })

    it('sem assinatura dá SUBSCRIPTION_REQUIRED', async () => {
      tx.$queryRaw.mockResolvedValue([])
      expect(await appError(service.create('user-1', input))).toMatchObject({
        status: 403,
        code: 'SUBSCRIPTION_REQUIRED',
      })
    })

    it('plano vencido dá PLAN_EXPIRED', async () => {
      tx.$queryRaw.mockResolvedValue([{ plan: 'TRIAL', expiresAt: past }])
      const error = await service.create('user-1', input).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(PlanExpiredException)
      expect(tx.organization.create).not.toHaveBeenCalled()
    })

    it('no limite dá PLAN_LIMIT_REACHED com params', async () => {
      tx.organization.count.mockResolvedValue(1)
      expect(await appError(service.create('user-1', input))).toEqual({
        status: 403,
        code: 'PLAN_LIMIT_REACHED',
        params: { limit: 'organizations', max: 1 },
      })
      expect(tx.organization.create).not.toHaveBeenCalled()
    })

    it('slug usado dá SLUG_ALREADY_IN_USE', async () => {
      tx.organization.findUnique.mockResolvedValue({ id: 'outra' })
      expect((await appError(service.create('user-1', input))).code).toBe('SLUG_ALREADY_IN_USE')
    })

    it('P2002 em corrida vira SLUG_ALREADY_IN_USE', async () => {
      tx.organization.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
      )
      expect(await appError(service.create('user-1', input))).toMatchObject({
        status: 409,
        code: 'SLUG_ALREADY_IN_USE',
      })
    })
  })

  describe('update', () => {
    const access = (isOwner: boolean) => ({ organization: stored(), isOwner })

    it('só o dono edita', async () => {
      tenants.resolveOrganization.mockResolvedValue(access(false))
      expect((await appError(service.update('user-2', 'acme', { name: 'X' }))).code).toBe(
        'NOT_ALLOWED',
      )
      expect(tenants.assertWritable).not.toHaveBeenCalled()
    })

    it.each([
      [{ name: 'X' }, false],
      [{ isActive: false }, false],
      [{ isActive: true, name: 'X' }, false],
      [{ isActive: true }, true],
    ])('%j passa por assertWritable com reactivating %s', async (body, reactivating) => {
      tenants.resolveOrganization.mockResolvedValue(access(true))
      db.organization.update.mockResolvedValue(stored())
      await service.update('user-1', 'acme', body)
      expect(tenants.assertWritable).toHaveBeenCalledWith(access(true), { reactivating })
      expect(db.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'org-1' }, data: body }),
      )
    })

    it('não grava se assertWritable recusa', async () => {
      tenants.resolveOrganization.mockResolvedValue(access(true))
      tenants.assertWritable.mockRejectedValue(new PlanExpiredException())
      await expect(service.update('user-1', 'acme', { name: 'X' })).rejects.toBeInstanceOf(
        PlanExpiredException,
      )
      expect(db.organization.update).not.toHaveBeenCalled()
    })
  })

  it('list filtra dono ou membro de unidade ativa e marca isOwner', async () => {
    db.organization.findMany.mockResolvedValue([stored(), stored({ ownerId: 'outro' })])
    const list = await service.list('user-1')
    expect(list.map((o) => o.access.isOwner)).toEqual([true, false])
    expect(db.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { ownerId: 'user-1' },
            {
              isActive: true,
              units: { some: { isActive: true, members: { some: { userId: 'user-1' } } } },
            },
          ],
        },
        orderBy: { name: 'asc' },
      }),
    )
  })
})
