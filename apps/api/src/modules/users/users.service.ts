import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '@infra/database/database.service'
import { AuthUser, toAuthUser } from '@modules/auth/auth-user'

import { SetSystemRoleInput } from './schemas/system-role.schemas'

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  async setSystemRole(email: string, { systemRole }: SetSystemRoleInput): Promise<AuthUser> {
    const user = await this.database.user.findUnique({ where: { email } })
    if (!user) throw new NotFoundException({ statusCode: 404, message: 'User not found' })
    if (user.systemRole === 'MASTER') {
      throw new ConflictException({ statusCode: 409, message: 'Cannot change the master' })
    }

    const updated = await this.database.user.update({
      where: { id: user.id },
      data: { systemRole },
    })
    return toAuthUser(updated)
  }
}
