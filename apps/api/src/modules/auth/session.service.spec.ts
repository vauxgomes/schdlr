import { createHash } from 'node:crypto'

import { ConfigService } from '@nestjs/config'

import { Env } from '@config/env.schema'
import { DatabaseService } from '@infra/database/database.service'

import { SessionService } from './session.service'

const config = { get: () => 7 } as unknown as ConfigService<Env, true>
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

describe('SessionService', () => {
  let refreshToken: Record<'create' | 'findUnique' | 'updateMany', jest.Mock>
  let service: SessionService

  const stored = (overrides: Record<string, unknown> = {}) => ({
    id: 'rt-1',
    userId: 'user-1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { isActive: true },
    ...overrides,
  })

  beforeEach(() => {
    refreshToken = {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    }
    service = new SessionService({ refreshToken } as unknown as DatabaseService, config)
  })

  it('cria token opaco e grava só o SHA-256, com validade em dias', async () => {
    const { refreshToken: token, expiresAt } = await service.create('user-1')

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [{ data }] = refreshToken.create.mock.calls[0] as [{ data: Record<string, unknown> }]
    expect(data.tokenHash).toBe(sha256(token))
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeCloseTo(7, 1)
  })

  it('gira: revoga o usado e emite outro', async () => {
    refreshToken.findUnique.mockResolvedValue(stored())

    const rotated = await service.rotate('token-velho')

    expect(rotated?.userId).toBe('user-1')
    expect(rotated?.refreshToken).not.toBe('token-velho')
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    })
    expect(refreshToken.create).toHaveBeenCalled()
  })

  it('reuso de token revogado derruba todas as sessões', async () => {
    refreshToken.findUnique.mockResolvedValue(stored({ revokedAt: new Date() }))

    await expect(service.rotate('token-velho')).resolves.toBeNull()
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    })
    expect(refreshToken.create).not.toHaveBeenCalled()
  })

  it('refresh simultâneo com o mesmo token conta como reuso', async () => {
    refreshToken.findUnique.mockResolvedValue(stored())
    refreshToken.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(service.rotate('token')).resolves.toBeNull()
    expect(refreshToken.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    })
  })

  it.each([
    ['desconhecido', null],
    ['vencido', stored({ expiresAt: new Date(Date.now() - 1) })],
    ['de usuário inativo', stored({ user: { isActive: false } })],
  ])('recusa token %s', async (_label, row) => {
    refreshToken.findUnique.mockResolvedValue(row)
    await expect(service.rotate('token')).resolves.toBeNull()
    expect(refreshToken.create).not.toHaveBeenCalled()
  })

  it('revoke procura pelo hash', async () => {
    await service.revoke('token')
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('token'), revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    })
  })
})
