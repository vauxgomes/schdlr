import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'

import { AppException } from '../errors/app.exception'
import { AppExceptionFilter } from './app-exception.filter'

function respond(exception: unknown) {
  const res = { status: jest.fn(), json: jest.fn() }
  res.status.mockReturnValue(res)
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost

  new AppExceptionFilter().catch(exception, host)

  const [[status]] = res.status.mock.calls as [[number]]
  const [[body]] = res.json.mock.calls as [[Record<string, unknown>]]
  return { status, body }
}

describe('AppExceptionFilter', () => {
  let logged: jest.SpyInstance

  beforeEach(() => {
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation()
  })
  afterEach(() => logged.mockRestore())

  it('AppException sai com o corpo do catálogo', () => {
    expect(respond(new AppException('USER_NOT_FOUND'))).toEqual({
      status: 404,
      body: { statusCode: 404, code: 'USER_NOT_FOUND', message: 'User not found' },
    })
  })

  it('AppException com params e errors os inclui', () => {
    const errors = [{ path: 'name', code: 'too_small', message: 'm' }]
    expect(respond(new AppException('VALIDATION_FAILED', { a: 1 }, errors)).body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      params: { a: 1 },
      errors,
    })
  })

  it.each([
    [new BadRequestException('Unexpected token b in JSON'), 400, 'BAD_REQUEST', 'Bad request'],
    [new UnauthorizedException(), 401, 'UNAUTHORIZED', 'Unauthorized'],
    [new ForbiddenException('Forbidden resource'), 403, 'FORBIDDEN', 'Forbidden'],
    [new NotFoundException('Cannot GET /api/x'), 404, 'NOT_FOUND', 'Not found'],
    [
      new HttpException('slow down', HttpStatus.TOO_MANY_REQUESTS),
      429,
      'TOO_MANY_REQUESTS',
      'Too many requests',
    ],
    [new HttpException('gone', HttpStatus.GONE), 410, 'HTTP_ERROR', 'Request failed'],
    [new ServiceUnavailableException('down'), 503, 'INTERNAL_ERROR', 'Internal server error'],
  ])(
    'exceção do Nest %#: status mantido, código e mensagem do catálogo',
    (e, status, code, msg) => {
      expect(respond(e)).toEqual({ status, body: { statusCode: status, code, message: msg } })
    },
  )

  it('não registra os 4xx', () => {
    respond(new NotFoundException())
    respond(new AppException('PLAN_EXPIRED'))
    expect(logged).not.toHaveBeenCalled()
  })

  it('erro qualquer vira 500 sem detalhe, com o stack no log', () => {
    const error = new Error('connection to db at 10.0.0.1 refused')

    expect(respond(error)).toEqual({
      status: 500,
      body: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })
    expect(logged).toHaveBeenCalledWith(error.message, error.stack)
  })

  it('valor lançado que não é Error também vira 500', () => {
    expect(respond('boom').status).toBe(500)
    expect(logged).toHaveBeenCalledWith('boom')
  })
})
