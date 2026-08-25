import { ConfigService } from '@nestjs/config'
import type { CookieOptions, Request, Response } from 'express'
import { Env } from '../../../config/env'

export const REFRESH_COOKIE = 'refresh_token'

const DAY_IN_MS = 24 * 60 * 60 * 1000

// `path` restrito a /auth: o cookie acompanha refresh e logout, e não viaja em
// toda requisição da aplicação. Precisa ser idêntico na escrita e na limpeza,
// senão o navegador guarda um cookie que o clearCookie não alcança.
function options(config: ConfigService<Env, true>): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.get('NODE_ENV', { infer: true }) === 'production',
    path: '/auth',
  }
}

export function readRefreshCookie(request: Request) {
  return (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]
}

export function setRefreshCookie(
  response: Response,
  token: string,
  config: ConfigService<Env, true>,
) {
  response.cookie(REFRESH_COOKIE, token, {
    ...options(config),
    maxAge: config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * DAY_IN_MS,
  })
}

export function clearRefreshCookie(response: Response, config: ConfigService<Env, true>) {
  response.clearCookie(REFRESH_COOKIE, options(config))
}
