import { Controller, Get } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, TestContext } from './support/app'
import { truncateAll } from './support/database'

const CREDENTIALS = { name: 'Vaux', email: 'vaux@schdlr.test', password: 'sup3r-secret' }

// Rota qualquer sem @Public(), só para o guard global ter onde incidir. Sem ela
// o teste bateria numa rota inexistente e receberia 404 do Express, sem o guard
// chegar a rodar — o que não prova nada.
@Controller('protected-probe')
class ProtectedProbeController {
  @Get()
  ping() {
    return { ok: true }
  }
}

function decodePayload(accessToken: string): Record<string, unknown> {
  const [, payload] = accessToken.split('.')

  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>
}

function refreshCookie(headers: Record<string, unknown>) {
  const cookies = (headers['set-cookie'] as string[] | undefined) ?? []

  return cookies.find((cookie) => cookie.startsWith('refresh_token='))
}

describe('Auth (e2e)', () => {
  let context: TestContext

  const server = () => request(context.app.getHttpServer())

  const register = () => server().post('/auth/register').send(CREDENTIALS)

  const login = () =>
    server().post('/auth/login').send({ email: CREDENTIALS.email, password: CREDENTIALS.password })

  beforeAll(async () => {
    context = await createTestApp([ProtectedProbeController])
  })

  beforeEach(async () => {
    await truncateAll(context.db)
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('register', () => {
    it('creates the user with a TRIAL subscription', async () => {
      const response = await register()

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({ name: 'Vaux', email: CREDENTIALS.email })

      const subscription = await context.db.subscription.findFirstOrThrow()

      expect(subscription.plan).toBe('TRIAL')
      expect(subscription.status).toBe('ACTIVE')
    })

    it('answers 409 for an email already taken', async () => {
      await register()

      const response = await register()

      expect(response.status).toBe(409)
    })

    it('never returns the password hash', async () => {
      const response = await register()

      expect(JSON.stringify(response.body)).not.toContain('$2b$')
      expect(response.body).not.toHaveProperty('passwordHash')
    })
  })

  describe('login', () => {
    beforeEach(async () => {
      await register()
    })

    it('returns an access token and sets the refresh cookie', async () => {
      const response = await login()

      expect(response.status).toBe(200)
      expect(typeof (response.body as { accessToken: string }).accessToken).toBe('string')

      const cookie = refreshCookie(response.headers)

      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Path=/auth')
    })

    it('carries sub and staffRole in the payload, and nothing about units', async () => {
      const response = await login()
      const payload = decodePayload((response.body as { accessToken: string }).accessToken)

      expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'staffRole', 'sub'])
    })

    it('answers the same for a wrong password and an unknown email', async () => {
      const wrongPassword = await server()
        .post('/auth/login')
        .send({ email: CREDENTIALS.email, password: 'wrong-password' })

      const unknownEmail = await server()
        .post('/auth/login')
        .send({ email: 'nobody@schdlr.test', password: CREDENTIALS.password })

      expect(wrongPassword.status).toBe(401)
      expect(unknownEmail.status).toBe(401)
      expect(wrongPassword.body).toEqual(unknownEmail.body)
    })

    it('refuses an inactive user', async () => {
      await context.db.user.update({
        where: { email: CREDENTIALS.email },
        data: { isActive: false },
      })

      await expect(login().then((response) => response.status)).resolves.toBe(401)
    })

    it('stores the refresh token hashed, never in the clear', async () => {
      const response = await login()
      const cookie = refreshCookie(response.headers) as string
      const raw = cookie.split(';')[0].replace('refresh_token=', '')

      const stored = await context.db.refreshToken.findFirstOrThrow()

      expect(stored.token).not.toBe(raw)
      expect(stored.token).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('refresh', () => {
    it('rotates the token and invalidates the previous one', async () => {
      await register()
      const first = refreshCookie((await login()).headers) as string

      const rotated = await server().post('/auth/refresh').set('Cookie', first)

      expect(rotated.status).toBe(200)
      expect(refreshCookie(rotated.headers)).not.toBe(first)

      const reused = await server().post('/auth/refresh').set('Cookie', first)

      expect(reused.status).toBe(401)
    })

    it('answers 401 without a cookie', async () => {
      const response = await server().post('/auth/refresh')

      expect(response.status).toBe(401)
    })
  })

  describe('logout', () => {
    it('revokes the refresh token and clears the cookie', async () => {
      await register()
      const cookie = refreshCookie((await login()).headers) as string

      const response = await server().post('/auth/logout').set('Cookie', cookie)

      expect(response.status).toBe(204)

      const stored = await context.db.refreshToken.findFirstOrThrow()

      expect(stored.revokedAt).not.toBeNull()

      const afterLogout = await server().post('/auth/refresh').set('Cookie', cookie)

      expect(afterLogout.status).toBe(401)
    })
  })

  describe('global guard', () => {
    it('answers 401 on a route without @Public()', async () => {
      const response = await server().get('/protected-probe')

      expect(response.status).toBe(401)
    })

    it('lets a valid access token through', async () => {
      await register()
      const { accessToken } = (await login()).body as { accessToken: string }

      const response = await server()
        .get('/protected-probe')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
    })

    it('refuses a tampered token', async () => {
      await register()
      const { accessToken } = (await login()).body as { accessToken: string }

      const response = await server()
        .get('/protected-probe')
        .set('Authorization', `Bearer ${accessToken.slice(0, -1)}x`)

      expect(response.status).toBe(401)
    })

    it('leaves the routes marked @Public() open', async () => {
      await expect(
        server()
          .get('/')
          .then((response) => response.status),
      ).resolves.toBe(200)
      await expect(
        server()
          .get('/health')
          .then((response) => response.status),
      ).resolves.toBe(200)
    })
  })
})
