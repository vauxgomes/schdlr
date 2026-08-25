import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import type { Request } from 'express'
import { DatabaseService } from '../../../infra/database/database.service'
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy'
import { UNIT_CONTEXT, UnitContext } from '../unit-context'

// Global, mas inerte onde a rota não tem :unitId. Assim nenhum dos módulos
// aninhados sob a unidade precisa lembrar de aplicá-lo — esquecer de proteger
// seria pior do que esquecer de abrir.
@Injectable()
export class UnitMemberGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & Record<string, unknown>>()
    const unitId = (request.params as Record<string, string | undefined>).unitId

    if (!unitId) return true

    const user = request.user as AuthenticatedUser | undefined

    if (!user) return true

    const unit = await this.db.unit.findUnique({
      where: { id: unitId },
      select: { id: true, organizationId: true, organization: { select: { ownerId: true } } },
    })

    if (!unit) throw new NotFoundException('Unit not found')

    const member = await this.db.unitMember.findUnique({
      where: { userId_unitId: { userId: user.userId, unitId } },
      select: { id: true, roles: true, isActive: true },
    })

    const unitContext: UnitContext = {
      unitId: unit.id,
      organizationId: unit.organizationId,
      memberId: member?.isActive ? member.id : null,
      roles: member?.isActive ? member.roles : [],
      isOwner: unit.organization.ownerId === user.userId,
    }

    request[UNIT_CONTEXT] = unitContext

    return true
  }
}
