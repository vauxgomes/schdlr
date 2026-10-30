import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'

import { PlanExpiredException } from './plan-expired.exception'
import { addMonths } from './plans'
import { SubscriptionsService } from './subscriptions.service'

const DAY = 86_400_000
const future = () => new Date(Date.now() + 10 * DAY)
const past = () => new Date(Date.now() - DAY)

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  userId: 'user-1',
  plan: 'TRIAL',
  startsAt: new Date('2026-10-01T00:00:00.000Z'),
  expiresAt: future(),
  assignedById: 'master-1',
  user: { email: 'teacher@schdlr.dev' },
  assignedBy: { email: 'master@schdlr.dev' },
  ...overrides,
})

async function appError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  const exception = error as AppException
  return { status: exception.getStatus(), code: exception.code }
}

describe('SubscriptionsService', () => {
  let user: { findUnique: jest.Mock }
  let subscription: Record<'findUnique' | 'upsert' | 'update', jest.Mock>
  let service: SubscriptionsService

  beforeEach(() => {
    user = { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) }
    subscription = {
      findUnique: jest.fn(),
      upsert: jest
        .fn()
        .mockImplementation(({ create }: { create: Record<string, unknown> }) =>
          Promise.resolve(row(create)),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(row(data)),
        ),
    }
    service = new SubscriptionsService({ user, subscription } as unknown as DatabaseService)
  })

  describe('getActivePlan', () => {
    it('é null sem assinatura', async () => {
      subscription.findUnique.mockResolvedValue(null)
      await expect(service.getActivePlan('user-1')).resolves.toBeNull()
    })

    it('ACTIVE dentro da validade, com os limites do plano', async () => {
      subscription.findUnique.mockResolvedValue(row())
      await expect(service.getActivePlan('user-1')).resolves.toMatchObject({
        plan: 'TRIAL',
        status: 'ACTIVE',
        limits: { organizations: 1, unitsPerOrganization: 1, coursesPerUnit: 3 },
      })
    })

    it('EXPIRED depois da validade', async () => {
      subscription.findUnique.mockResolvedValue(row({ expiresAt: past() }))
      await expect(service.getActivePlan('user-1')).resolves.toMatchObject({ status: 'EXPIRED' })
    })

    it('GRACE é sempre ACTIVE', async () => {
      subscription.findUnique.mockResolvedValue(row({ plan: 'GRACE', expiresAt: null }))
      await expect(service.getActivePlan('user-1')).resolves.toMatchObject({
        plan: 'GRACE',
        status: 'ACTIVE',
        expiresAt: null,
      })
    })
  })

  describe('assign', () => {
    it('TRIAL sem data vence em 1 mês, com startsAt e assignedBy novos', async () => {
      const before = new Date()
      await service.assign('teacher@schdlr.dev', { plan: 'TRIAL' }, 'support-1')

      const [{ create, update }] = subscription.upsert.mock.calls[0] as [
        { create: Record<string, Date>; update: Record<string, unknown> },
      ]
      expect(create.startsAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(create.expiresAt.toISOString()).toBe(addMonths(create.startsAt, 1).toISOString())
      expect(update).toMatchObject({ plan: 'TRIAL', assignedById: 'support-1' })
    })

    it('TRIAL com data usa a data informada', async () => {
      const expiresAt = future()
      await service.assign('teacher@schdlr.dev', { plan: 'TRIAL', expiresAt }, 'support-1')
      const [{ update }] = subscription.upsert.mock.calls[0] as [{ update: { expiresAt: Date } }]
      expect(update.expiresAt).toBe(expiresAt)
    })

    it('GRACE grava sem validade', async () => {
      const view = await service.assign('teacher@schdlr.dev', { plan: 'GRACE' }, 'support-1')
      expect(view).toMatchObject({ plan: 'GRACE', expiresAt: null, status: 'ACTIVE' })
    })

    it('devolve o formato da assinatura', async () => {
      const view = await service.assign('teacher@schdlr.dev', { plan: 'TRIAL' }, 'support-1')
      expect(Object.keys(view).sort()).toEqual(
        ['assignedBy', 'email', 'expiresAt', 'limits', 'plan', 'startsAt', 'status'].sort(),
      )
      expect(view.email).toBe('teacher@schdlr.dev')
      expect(view.assignedBy).toBe('master@schdlr.dev')
    })

    it('e-mail sem usuário dá 404', async () => {
      user.findUnique.mockResolvedValue(null)
      expect(await appError(service.assign('x@y.dev', { plan: 'TRIAL' }, 's'))).toEqual({
        status: 404,
        code: 'USER_NOT_FOUND',
      })
    })
  })

  describe('extend', () => {
    it('soma 1 mês à validade futura', async () => {
      const expiresAt = future()
      subscription.findUnique.mockResolvedValue(row({ expiresAt }))

      await service.extend('teacher@schdlr.dev', 'support-1')

      expect(subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { expiresAt: addMonths(expiresAt, 1), assignedById: 'support-1' },
        }),
      )
    })

    it('vencido conta a partir de agora', async () => {
      subscription.findUnique.mockResolvedValue(row({ expiresAt: past() }))
      const before = Date.now()

      await service.extend('teacher@schdlr.dev', 'support-1')

      const [{ data }] = subscription.update.mock.calls[0] as [{ data: { expiresAt: Date } }]
      const expected = addMonths(new Date(before), 1).getTime()
      expect(Math.abs(data.expiresAt.getTime() - expected)).toBeLessThan(5_000)
    })

    it('GRACE dá 409', async () => {
      subscription.findUnique.mockResolvedValue(row({ plan: 'GRACE', expiresAt: null }))
      expect(await appError(service.extend('admin@schdlr.dev', 's'))).toEqual({
        status: 409,
        code: 'PLAN_DOES_NOT_EXPIRE',
      })
    })

    it('sem assinatura dá 404', async () => {
      subscription.findUnique.mockResolvedValue(null)
      expect(await appError(service.extend('teacher@schdlr.dev', 's'))).toEqual({
        status: 404,
        code: 'SUBSCRIPTION_NOT_FOUND',
      })
    })
  })

  it('findByEmail sem assinatura dá 404', async () => {
    subscription.findUnique.mockResolvedValue(null)
    expect(await appError(service.findByEmail('teacher@schdlr.dev'))).toEqual({
      status: 404,
      code: 'SUBSCRIPTION_NOT_FOUND',
    })
  })
})

describe('PlanExpiredException', () => {
  it('é a AppException PLAN_EXPIRED, com 403', () => {
    const exception = new PlanExpiredException()
    expect(exception).toBeInstanceOf(AppException)
    expect(exception.getStatus()).toBe(403)
    expect(exception.getBody()).toEqual({
      statusCode: 403,
      code: 'PLAN_EXPIRED',
      message: 'Plan expired',
    })
  })
})
