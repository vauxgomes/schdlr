import { HttpStatus } from '@nestjs/common'

/**
 * Catálogo de erros da API. O `code` é contrato com o web (que traduz por ele); a `message` é só
 * para log e curl. Trocar ou remover um código pede spec (0008).
 */
export const ERRORS = {
  // Genéricos: o filtro também os usa para as exceções do Nest, pelo status.
  BAD_REQUEST: { status: HttpStatus.BAD_REQUEST, message: 'Bad request' },
  VALIDATION_FAILED: { status: HttpStatus.BAD_REQUEST, message: 'Validation failed' },
  UNAUTHORIZED: { status: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' },
  FORBIDDEN: { status: HttpStatus.FORBIDDEN, message: 'Forbidden' },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Not found' },
  TOO_MANY_REQUESTS: { status: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests' },
  // Outro 4xx do Nest: a resposta mantém o status original; o daqui é só o padrão.
  HTTP_ERROR: { status: HttpStatus.BAD_REQUEST, message: 'Request failed' },
  INTERNAL_ERROR: { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' },

  // Auth (0004)
  INVALID_OR_EXPIRED_CODE: { status: HttpStatus.UNAUTHORIZED, message: 'Invalid or expired code' },
  EMAIL_ALREADY_REGISTERED: { status: HttpStatus.CONFLICT, message: 'Email already registered' },
  OTP_COOLDOWN: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Wait before requesting a new code',
  },
  EMAIL_SEND_FAILED: { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Could not send email' },

  // Assinaturas e papel do sistema (0006)
  USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'User not found' },
  SUBSCRIPTION_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Subscription not found' },
  PLAN_DOES_NOT_EXPIRE: { status: HttpStatus.CONFLICT, message: 'Plan does not expire' },
  CANNOT_CHANGE_MASTER: { status: HttpStatus.CONFLICT, message: 'Cannot change the master' },
  PLAN_EXPIRED: { status: HttpStatus.FORBIDDEN, message: 'Plan expired' },
} as const satisfies Record<string, { status: HttpStatus; message: string }>

export type ErrorCode = keyof typeof ERRORS
