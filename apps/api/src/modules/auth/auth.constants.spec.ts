import { refreshCookieOptions } from './auth.constants'

describe('refreshCookieOptions', () => {
  it('é httpOnly, lax, restrito a /api/auth e dura os dias da sessão', () => {
    expect(refreshCookieOptions(false, 7)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
  })

  it('só é Secure em produção', () => {
    expect(refreshCookieOptions(true, 7).secure).toBe(true)
  })
})
