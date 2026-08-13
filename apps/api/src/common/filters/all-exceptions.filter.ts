import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import { Response } from 'express'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception)
      response.status(500).json({ statusCode: 500, message: 'Internal server error' })
      return
    }

    const statusCode = exception.getStatus()
    const payload = exception.getResponse()

    if (typeof payload === 'string') {
      response.status(statusCode).json({ statusCode, message: payload })
      return
    }

    // Descarta o campo `error` do corpo padrão do Nest; mantém `issues` quando o
    // ZodValidationPipe o anexa.
    const { message, issues } = payload as { message?: unknown; issues?: unknown }

    response.status(statusCode).json({
      statusCode,
      message: message ?? exception.message,
      ...(issues ? { issues } : {}),
    })
  }
}
