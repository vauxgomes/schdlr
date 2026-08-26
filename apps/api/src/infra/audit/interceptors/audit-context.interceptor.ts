import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request } from 'express'
import { randomUUID } from 'node:crypto'
import { AuthenticatedUser } from '../../../modules/auth/strategies/jwt.strategy'
import { UNIT_CONTEXT, UnitContext } from '../../../modules/units/unit-context'
import { auditStorage } from '../audit-context'
import { AuditService } from '../audit.service'

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request & Record<string, unknown>>()
    const user = request.user as AuthenticatedUser | undefined

    // Sem usuário não há ator, e rota pública não produz trilha.
    if (!user) return next.handle()

    const unit = request[UNIT_CONTEXT] as UnitContext | undefined
    const path = (request.route as { path?: string } | undefined)?.path ?? request.path

    return auditStorage.run(
      {
        userId: user.userId,
        memberId: unit?.memberId ?? null,
        unitId: unit?.unitId ?? null,
        requestId: randomUUID(),
        route: `${request.method}_${path}`,
        recordDenied: (subject, data) => this.audit.recordDenied(subject, data),
      },
      () => next.handle(),
    )
  }
}
