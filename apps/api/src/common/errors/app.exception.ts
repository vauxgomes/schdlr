import { HttpException } from '@nestjs/common'

import { ERRORS, ErrorCode } from './error-codes'

export type ErrorParams = Record<string, unknown>

export type ValidationErrorItem = {
  path: string
  code: string
  message: string
  params?: ErrorParams
}

/** Corpo de toda resposta de erro da API (spec 0008). */
export type ErrorBody = {
  statusCode: number
  code: ErrorCode
  message: string
  params?: ErrorParams
  errors?: ValidationErrorItem[]
}

/** O único jeito de lançar erro de regra: status e mensagem vêm do catálogo. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly params?: ErrorParams,
    readonly errors?: ValidationErrorItem[],
  ) {
    const { status, message } = ERRORS[code]
    super(message, status)
  }

  getBody(): ErrorBody {
    const { status, message } = ERRORS[this.code]
    return {
      statusCode: status,
      code: this.code,
      message,
      ...(this.params && { params: this.params }),
      ...(this.errors && { errors: this.errors }),
    }
  }
}
