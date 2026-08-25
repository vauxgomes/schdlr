import type { Request } from 'express'

export const REFRESH_COOKIE = 'refresh_token'

export function readRefreshCookie(request: Request) {
  return (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]
}
