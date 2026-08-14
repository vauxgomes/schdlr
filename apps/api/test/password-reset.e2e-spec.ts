import { createHash } from 'node:crypto'
import request from 'supertest'
import { MailService } from '../src/infra/mail/mail.service'
import { createTestApp, TestContext } from './support/app'
import { truncateAll } from './support/database'

const CREDENTIALS = { name: 'Vaux', email: 'vaux@schdlr.test', password: 'sup3r-secret' }
const NEW_PASSWORD = 'brand-new-secret'

const flush = () => new Promise((resolve) => setImmediate(resolve))

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

describe('Password reset (e2e)', () => {
  let context: TestContext
  let send: jest.SpyInstance

  const server = () => request(context.app.getHttpServer())

  const register = () => server().post('/auth/register').send(CREDENTIALS)

  const forgot = (email: string) => server().post('/auth/forgot-password').send({ email })

  const login = (password: string) =>
    server().post('/auth/login').send({ email: CREDENTIALS.email, password })

  // O token em claro só existe no link do e-mail — é de lá que o teste o tira,
  // exatamente como faria quem recebeu a mensagem.
  async function requestToken() {
    await forgot(CREDENTIALS.email)
    await flush()

    const [message] = send.mock.calls[0] as [{ html: string }]
    const { html } = message
    const [, token] = /token=([a-f0-9]+)/.exec(html) ?? []

    return token
  }

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    send = jest.spyOn(context.app.get(MailService), 'send').mockResolvedValue(undefined)
    await register()
    await flush()
    send.mockClear()
  })

  afterEach(() => {
    send.mockRestore()
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('forgot-password', () => {
    it('answers the same for a known and an unknown email', async () => {
      const known = await forgot(CREDENTIALS.email)
      const unknown = await forgot('nobody@schdlr.test')

      expect(known.status).toBe(204)
      expect(unknown.status).toBe(known.status)
      expect(unknown.body).toEqual(known.body)
    })

    it('creates no reset row for an unknown email', async () => {
      await forgot('nobody@schdlr.test')
      await flush()

      expect(await context.db.passwordReset.count()).toBe(0)
      expect(send).not.toHaveBeenCalled()
    })

    it('stores the token hashed, never the value that went in the email', async () => {
      const token = await requestToken()
      const stored = await context.db.passwordReset.findFirstOrThrow()

      expect(token).toMatch(/^[a-f0-9]{64}$/)
      expect(stored.token).not.toBe(token)
      expect(stored.token).toBe(sha256(token))
    })
  })

  describe('reset-password', () => {
    it('changes the password and retires the old one', async () => {
      const token = await requestToken()

      const response = await server()
        .post('/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })

      expect(response.status).toBe(204)
      await expect(login(NEW_PASSWORD).then((res) => res.status)).resolves.toBe(200)
      await expect(login(CREDENTIALS.password).then((res) => res.status)).resolves.toBe(401)
    })

    it('refuses a token that was already used', async () => {
      const token = await requestToken()

      await server().post('/auth/reset-password').send({ token, password: NEW_PASSWORD })

      const second = await server()
        .post('/auth/reset-password')
        .send({ token, password: 'another-secret' })

      expect(second.status).toBe(400)
      await expect(login(NEW_PASSWORD).then((res) => res.status)).resolves.toBe(200)
    })

    it('refuses an expired token, leaving the password untouched', async () => {
      const token = await requestToken()

      await context.db.passwordReset.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      })

      const response = await server()
        .post('/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })

      expect(response.status).toBe(400)
      await expect(login(CREDENTIALS.password).then((res) => res.status)).resolves.toBe(200)
    })

    it('refuses a token that never existed', async () => {
      const response = await server()
        .post('/auth/reset-password')
        .send({ token: 'a'.repeat(64), password: NEW_PASSWORD })

      expect(response.status).toBe(400)
    })

    it('kills the sessions opened before the reset', async () => {
      const { headers } = await login(CREDENTIALS.password)
      const cookies = headers['set-cookie'] as unknown as string[]
      const refreshCookie = cookies.find((cookie) => cookie.startsWith('refresh_token=')) as string

      const token = await requestToken()
      await server().post('/auth/reset-password').send({ token, password: NEW_PASSWORD })

      const refreshed = await server().post('/auth/refresh').set('Cookie', refreshCookie)

      expect(refreshed.status).toBe(401)
    })
  })
})
