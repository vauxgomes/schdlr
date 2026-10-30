import { AppException } from '@common/errors/app.exception'

/** Plano do dono da organização vencido: a organização fica só leitura. */
export class PlanExpiredException extends AppException {
  constructor() {
    super('PLAN_EXPIRED')
  }
}
