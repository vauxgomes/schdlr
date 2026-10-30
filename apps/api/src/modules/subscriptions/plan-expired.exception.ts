import { ForbiddenException } from '@nestjs/common'

/** Plano do dono da organização vencido: a organização fica só leitura. */
export class PlanExpiredException extends ForbiddenException {
  constructor() {
    super({ statusCode: 403, message: 'Plan expired' })
  }
}
