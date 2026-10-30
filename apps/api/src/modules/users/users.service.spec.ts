import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'

import { UsersService } from './users.service'

const user = (systemRole: string) => ({
  id: 'user-1',
  email: 'teacher@schdlr.dev',
  name: 'Teacher',
  systemRole,
})

describe('UsersService.setSystemRole', () => {
  let users: { findUnique: jest.Mock; update: jest.Mock }
  let service: UsersService

  beforeEach(() => {
    users = {
      findUnique: jest.fn(),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: { systemRole: string } }) =>
          Promise.resolve({ ...user(data.systemRole), isActive: true }),
        ),
    }
    service = new UsersService({ user: users } as unknown as DatabaseService)
  })

  it('promove a SUPPORT e devolve o AuthUser', async () => {
    users.findUnique.mockResolvedValue(user('USER'))
    await expect(
      service.setSystemRole('teacher@schdlr.dev', { systemRole: 'SUPPORT' }),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'teacher@schdlr.dev',
      name: 'Teacher',
      systemRole: 'SUPPORT',
    })
  })

  it('não mexe no master', async () => {
    users.findUnique.mockResolvedValue(user('MASTER'))
    const error = (await service
      .setSystemRole('root@x.dev', { systemRole: 'USER' })
      .catch((e: unknown) => e)) as AppException
    expect(error.getStatus()).toBe(409)
    expect(error.code).toBe('CANNOT_CHANGE_MASTER')
    expect(users.update).not.toHaveBeenCalled()
  })

  it('e-mail sem usuário dá 404', async () => {
    users.findUnique.mockResolvedValue(null)
    const error = (await service
      .setSystemRole('x@y.dev', { systemRole: 'USER' })
      .catch((e: unknown) => e)) as AppException
    expect(error.getStatus()).toBe(404)
    expect(error.code).toBe('USER_NOT_FOUND')
  })
})
