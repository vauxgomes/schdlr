import { Injectable } from '@nestjs/common'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { AuthUser, toAuthUser } from '@modules/auth/auth-user'

import { SetSystemRoleInput } from './schemas/system-role.schemas'

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  async setSystemRole(email: string, { systemRole }: SetSystemRoleInput): Promise<AuthUser> {
    const user = await this.database.user.findUnique({ where: { email } })
    if (!user) throw new AppException('USER_NOT_FOUND')
    if (user.systemRole === 'MASTER') throw new AppException('CANNOT_CHANGE_MASTER')

    const updated = await this.database.user.update({
      where: { id: user.id },
      data: { systemRole },
    })
    return toAuthUser(updated)
  }
}
