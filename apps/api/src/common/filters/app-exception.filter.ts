import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import type { Response } from 'express'

import { AppException, ErrorBody } from '../errors/app.exception'
import { ERRORS, ErrorCode } from '../errors/error-codes'

/** Código das exceções do Nest, do Passport e do body-parser, que não trazem um. */
function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 429:
      return 'TOO_MANY_REQUESTS'
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR'
  }
}

/** Monta todo corpo de erro da API (spec 0008). Registrado no configureApp. */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const body = this.toBody(exception)
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body)
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof AppException) return exception.getBody()

    if (exception instanceof HttpException) {
      // O status se mantém; a mensagem é a do catálogo, nunca a do Nest ("Cannot GET /api/x").
      const statusCode = exception.getStatus()
      if (statusCode >= 500) this.log(exception)
      const code = codeForStatus(statusCode)
      return { statusCode, code, message: ERRORS[code].message }
    }

    // Nada da exceção interna (ou do Prisma) chega ao cliente: só ao log.
    this.log(exception)
    const { status, message } = ERRORS.INTERNAL_ERROR
    return { statusCode: status, code: 'INTERNAL_ERROR', message }
  }

  private log(exception: unknown) {
    if (exception instanceof Error) this.logger.error(exception.message, exception.stack)
    else this.logger.error(String(exception))
  }
}
