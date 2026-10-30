import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SystemRole } from '@prisma/client'
import type { Request } from 'express'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'

import { REQUIRED_SYSTEM_ROLE_KEY } from '../decorators/require-system-role.decorator'
import type { JwtPayload } from '../jwt-payload'

const RANK: Record<SystemRole, number> = { USER: 0, SUPPORT: 1, MASTER: 2 }

/**
 * Roda depois do JwtAuthGuard. O papel vem do banco, não do token: ele pode mudar enquanto o
 * access token ainda vale. Falhar aqui é 403 FORBIDDEN.
 */
@Injectable()
export class SystemRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SystemRole | undefined>(
      REQUIRED_SYSTEM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!required) return true

    const { user: payload } = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>()
    if (!payload) throw new AppException('FORBIDDEN')

    const user = await this.database.user.findUnique({
      where: { id: payload.sub },
      select: { systemRole: true, isActive: true },
    })
    if (!user?.isActive || RANK[user.systemRole] < RANK[required]) {
      throw new AppException('FORBIDDEN')
    }
    return true
  }
}
