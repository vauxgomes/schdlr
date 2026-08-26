import request from 'supertest'

import { createTestApp, TestContext } from '../support/app'
import { truncateAll } from '../support/database'

const CREDENTIALS = { name: 'Developer', email: 'developer@schdlr.test', password: 'sup3r-secret' }
const NEW_PASSWORD = 'brand-new-secret'

type Session = { accessToken: string; refreshCookie: string }

describe('Profile (e2e)', () => {
  let context: TestContext

  const server = () => request(context.app.getHttpServer())

  async function openSession(password = CREDENTIALS.password): Promise<Session> {
    const response = await server().post('/auth/login').send({ email: CREDENTIALS.email, password })

    const cookies = response.headers['set-cookie'] as unknown as string[]
    const { accessToken } = response.body as { accessToken: string }

    return {
      accessToken,
      refreshCookie: cookies.find((cookie) => cookie.startsWith('refresh_token=')) as string,
    }
  }

  const asUser = (session: Session, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    await server().post('/auth/register').send(CREDENTIALS)
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('GET /me', () => {
    it('answers 401 without a token', async () => {
      const response = await server().get('/me')

      expect(response.status).toBe(401)
    })

    it('returns the profile with the subscription, and no password hash', async () => {
      const session = await openSession()
      const response = await asUser(session, server().get('/me'))

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        name: CREDENTIALS.name,
        email: CREDENTIALS.email,
        subscription: { plan: 'TRIAL', status: 'ACTIVE' },
      })
      expect(response.body).not.toHaveProperty('passwordHash')
      expect(JSON.stringify(response.body)).not.toContain('$2b$')
    })
  })

  describe('PATCH /me', () => {
    it('changes the name', async () => {
      const session = await openSession()
      const response = await asUser(session, server().patch('/me')).send({
        name: 'Developer Renamed',
      })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ name: 'Developer Renamed' })

      const stored = await context.db.user.findUniqueOrThrow({
        where: { email: CREDENTIALS.email },
      })

      expect(stored.name).toBe('Developer Renamed')
    })

    it('rejects a name the schema refuses', async () => {
      const session = await openSession()
      const response = await asUser(session, server().patch('/me')).send({ name: 'x' })

      expect(response.status).toBe(400)
    })
  })

  describe('PATCH /me/password', () => {
    it('refuses a wrong current password and changes nothing', async () => {
      const session = await openSession()
      const before = await context.db.user.findUniqueOrThrow({
        where: { email: CREDENTIALS.email },
      })

      const response = await asUser(session, server().patch('/me/password')).send({
        currentPassword: 'not-my-password',
        newPassword: NEW_PASSWORD,
      })

      expect(response.status).toBe(400)

      const after = await context.db.user.findUniqueOrThrow({ where: { email: CREDENTIALS.email } })

      expect(after.passwordHash).toBe(before.passwordHash)
      await expect(openSession().then(() => 'still works')).resolves.toBe('still works')
    })

    // A decisão da spec: quem trocou continua dentro, todo o resto cai.
    it('keeps the session that changed it and kills the others', async () => {
      const other = await openSession()
      const mine = await openSession()

      const response = await asUser(mine, server().patch('/me/password'))
        .set('Cookie', mine.refreshCookie)
        .send({ currentPassword: CREDENTIALS.password, newPassword: NEW_PASSWORD })

      expect(response.status).toBe(204)

      const kept = await server().post('/auth/refresh').set('Cookie', mine.refreshCookie)
      const killed = await server().post('/auth/refresh').set('Cookie', other.refreshCookie)

      expect(kept.status).toBe(200)
      expect(killed.status).toBe(401)
    })

    it('lets the new password log in and retires the old one', async () => {
      const mine = await openSession()

      await asUser(mine, server().patch('/me/password'))
        .set('Cookie', mine.refreshCookie)
        .send({ currentPassword: CREDENTIALS.password, newPassword: NEW_PASSWORD })

      await expect(
        server()
          .post('/auth/login')
          .send({ email: CREDENTIALS.email, password: NEW_PASSWORD })
          .then((res) => res.status),
      ).resolves.toBe(200)

      await expect(
        server()
          .post('/auth/login')
          .send({ email: CREDENTIALS.email, password: CREDENTIALS.password })
          .then((res) => res.status),
      ).resolves.toBe(401)
    })
  })
})
