import { HttpException } from '@nestjs/common'

import { DatabaseService } from '@infra/database/database.service'
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service'

import { ProfileService } from './profile.service'

const createdAt = new Date('2026-10-29T22:00:00.000Z')
const user = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'admin@schdlr.dev',
  name: 'Admin Teste',
  systemRole: 'USER',
  isActive: true,
  emailVerifiedAt: createdAt,
  createdAt,
  updatedAt: createdAt,
  ...overrides,
})
const grace = {
  plan: 'GRACE',
  status: 'ACTIVE',
  expiresAt: null,
  limits: { organizations: 1, unitsPerOrganization: 1, coursesPerUnit: 5 },
}

describe('ProfileService', () => {
  let users: { findUnique: jest.Mock; update: jest.Mock }
  let organization: { count: jest.Mock }
  let subscriptions: { getActivePlan: jest.Mock }
  let service: ProfileService

  beforeEach(() => {
    users = { findUnique: jest.fn().mockResolvedValue(user()), update: jest.fn() }
    organization = { count: jest.fn().mockResolvedValue(1) }
    subscriptions = { getActivePlan: jest.fn().mockResolvedValue(grace) }
    service = new ProfileService(
      { user: users, organization } as unknown as DatabaseService,
      subscriptions as unknown as SubscriptionsService,
    )
  })

  it('monta o perfil no formato da spec', async () => {
    await expect(service.get('user-1')).resolves.toEqual({
      id: 'user-1',
      email: 'admin@schdlr.dev',
      name: 'Admin Teste',
      systemRole: 'USER',
      emailVerifiedAt: createdAt,
      createdAt,
      organizationsOwned: 1,
      subscription: grace,
    })
  })

  it('conta as organizações de que é dono, sem filtrar isActive', async () => {
    await service.get('user-1')
    expect(organization.count).toHaveBeenCalledWith({ where: { ownerId: 'user-1' } })
  })

  it('subscription é null sem assinatura', async () => {
    subscriptions.getActivePlan.mockResolvedValue(null)
    await expect(service.get('user-1')).resolves.toMatchObject({ subscription: null })
  })

  it.each([
    ['inexistente', null],
    ['inativo', user({ isActive: false })],
  ])('usuário %s dá 401', async (_label, found) => {
    users.findUnique.mockResolvedValue(found)
    for (const call of [service.get('user-1'), service.update('user-1', { name: 'X' })]) {
      const error = (await call.catch((e: unknown) => e)) as HttpException
      expect(error.getStatus()).toBe(401)
    }
    expect(users.update).not.toHaveBeenCalled()
  })

  it('update troca só o nome e devolve o perfil', async () => {
    users.findUnique
      .mockResolvedValueOnce({ isActive: true })
      .mockResolvedValueOnce(user({ name: 'Novo' }))

    const profile = await service.update('user-1', { name: 'Novo' })

    expect(users.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { name: 'Novo' } })
    expect(profile.name).toBe('Novo')
  })
})
