import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { DatabaseService } from '@infra/database/database.service'

import { SystemRoleGuard } from './system-role.guard'

function context(user?: { sub: string }) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
}

describe('SystemRoleGuard', () => {
  let findUnique: jest.Mock
  let required: string | undefined
  let guard: SystemRoleGuard

  beforeEach(() => {
    findUnique = jest.fn()
    required = undefined
    const reflector = { getAllAndOverride: () => required } as unknown as Reflector
    guard = new SystemRoleGuard(reflector, { user: { findUnique } } as unknown as DatabaseService)
  })

  it('rota sem o decorator passa sem consultar o banco', async () => {
    await expect(guard.canActivate(context({ sub: 'u' }))).resolves.toBe(true)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it.each([
    ['SUPPORT', 'USER', false],
    ['SUPPORT', 'SUPPORT', true],
    ['SUPPORT', 'MASTER', true],
    ['MASTER', 'SUPPORT', false],
    ['MASTER', 'MASTER', true],
  ])('exige %s: %s → %s', async (need, role, allowed) => {
    required = need
    findUnique.mockResolvedValue({ systemRole: role, isActive: true })
    await expect(guard.canActivate(context({ sub: 'u' }))).resolves.toBe(allowed)
  })

  it('usuário inativo ou inexistente não passa', async () => {
    required = 'SUPPORT'
    findUnique.mockResolvedValue({ systemRole: 'MASTER', isActive: false })
    await expect(guard.canActivate(context({ sub: 'u' }))).resolves.toBe(false)
    findUnique.mockResolvedValue(null)
    await expect(guard.canActivate(context({ sub: 'u' }))).resolves.toBe(false)
  })
})
