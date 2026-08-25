import type { CookieOptions, Request, Response } from 'express'

export const REFRESH_COOKIE = 'refresh_token'

const DAY_IN_MS = 24 * 60 * 60 * 1000

export type RefreshCookiePolicy = {
  ttlDays: number
  secure: boolean
}

// `path` restrito a /auth: o cookie acompanha refresh e logout, e não viaja em
// toda requisição da aplicação. Precisa ser idêntico na escrita e na limpeza,
// senão o navegador guarda um cookie que o clearCookie não alcança.
function options(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/auth' }
}

export function readRefreshCookie(request: Request) {
  return (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]
}

export function setRefreshCookie(response: Response, token: string, policy: RefreshCookiePolicy) {
  response.cookie(REFRESH_COOKIE, token, {
    ...options(policy.secure),
    maxAge: policy.ttlDays * DAY_IN_MS,
  })
}

export function clearRefreshCookie(response: Response, secure: boolean) {
  response.clearCookie(REFRESH_COOKIE, options(secure))
}
