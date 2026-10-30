import { CookieOptions } from 'express'

export const OTP_LENGTH = 6
export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_SECONDS = 60

export const REFRESH_COOKIE = 'schdlr_refresh'

export function refreshCookieOptions(isProduction: boolean, ttlDays: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/api/auth',
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  }
}
