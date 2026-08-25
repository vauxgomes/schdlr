import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { hashPassword, verifyPassword } from '../../common/password'
import { hashToken } from '../../common/token-hash'
import { DatabaseService } from '../../infra/database/database.service'
import { ChangePasswordInput } from './dto/change-password.dto'
import { UpdateProfileInput } from './dto/update-profile.dto'

// O que o front usa para montar o contexto do usuário. `passwordHash` não está
// aqui, e é este select que garante que ele não escape por engano.
const PROFILE = {
  id: true,
  name: true,
  email: true,
  staffRole: true,
  isActive: true,
  createdAt: true,
  subscription: {
    select: { id: true, plan: true, status: true, expiresAt: true },
  },
} satisfies Prisma.UserSelect

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  profile(userId: string) {
    return this.db.user.findUniqueOrThrow({ where: { id: userId }, select: PROFILE })
  }

  updateProfile(userId: string, input: UpdateProfileInput) {
    return this.db.user.update({
      where: { id: userId },
      data: { name: input.name },
      select: PROFILE,
    })
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    currentRefreshToken: string | undefined,
  ) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } })

    // Exigir a senha atual mesmo com sessão válida: sessão sequestrada não
    // pode trocar a senha e expulsar o dono.
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect')
    }

    const passwordHash = await hashPassword(input.newPassword)
    const keep = currentRefreshToken ? hashToken(currentRefreshToken) : undefined

    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.db.refreshToken.updateMany({
        where: { userId, revokedAt: null, ...(keep ? { NOT: { token: keep } } : {}) },
        data: { revokedAt: new Date() },
      }),
    ])
  }
}
