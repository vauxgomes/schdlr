import request from 'supertest'

import { createTestApp, TestContext } from '../support/app'
import { registerAndLogin, TestSession } from '../support/auth'
import { truncateAll } from '../support/database'

describe('Organizations (e2e)', () => {
  let context: TestContext
  let owner: TestSession
  let stranger: TestSession

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const createOrg = (session: TestSession, name: string) =>
    as(session, server().post('/organizations')).send({ name })

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    owner = await registerAndLogin(context)
    stranger = await registerAndLogin(context)
  })

  afterAll(async () => {
    await context.app.close()
  })

  it('answers 401 without a token', async () => {
    expect((await server().get('/organizations')).status).toBe(401)
  })

  describe('create', () => {
    it('makes the logged user the owner and derives the slug', async () => {
      const response = await createOrg(owner, 'Colégio São José')

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({
        name: 'Colégio São José',
        slug: 'colegio-sao-jose',
        ownerId: owner.userId,
        isActive: true,
      })
    })

    it('answers 409 when the slug is taken, even by another user', async () => {
      await createOrg(owner, 'Instituto Federal')

      const mine = await createOrg(owner, 'Instituto Federal')
      const theirs = await createOrg(stranger, 'Instituto Federal')

      expect(mine.status).toBe(409)
      expect(theirs.status).toBe(409)
    })
  })

  describe('list and select', () => {
    beforeEach(async () => {
      await createOrg(owner, 'Minha Escola')
      await createOrg(stranger, 'Escola do Vizinho')
    })

    it('never returns an organization owned by someone else', async () => {
      const response = await as(owner, server().get('/organizations'))
      const names = (response.body as { name: string }[]).map((org) => org.name)

      expect(names).toEqual(['Minha Escola'])
    })

    it('serves /select before /:id, with the minimal shape', async () => {
      const response = await as(owner, server().get('/organizations/select'))
      const [first] = response.body as Record<string, unknown>[]

      expect(response.status).toBe(200)
      expect(Object.keys(first).sort()).toEqual(['id', 'name', 'slug'])
    })
  })

  describe('ownership', () => {
    it('answers 403 when reading or changing someone else’s organization', async () => {
      const created = await createOrg(owner, 'Minha Escola')
      const { id } = created.body as { id: string }

      const read = await as(stranger, server().get(`/organizations/${id}`))
      const write = await as(stranger, server().patch(`/organizations/${id}`)).send({
        name: 'Roubada',
      })
      const erase = await as(stranger, server().delete(`/organizations/${id}`))

      expect([read.status, write.status, erase.status]).toEqual([403, 403, 403])

      const stored = await context.db.organization.findUniqueOrThrow({ where: { id } })

      expect(stored.name).toBe('Minha Escola')
    })

    it('answers 404 for an organization that does not exist', async () => {
      const response = await as(owner, server().get('/organizations/does-not-exist'))

      expect(response.status).toBe(404)
    })
  })

  describe('update and delete', () => {
    it('keeps the slug when the name changes, so shared links survive', async () => {
      const created = await createOrg(owner, 'Instituto Federal')
      const { id, slug } = created.body as { id: string; slug: string }

      const response = await as(owner, server().patch(`/organizations/${id}`)).send({
        name: 'Instituto Federal do RN',
      })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ name: 'Instituto Federal do RN', slug })
    })

    it('deletes an organization with no units', async () => {
      const created = await createOrg(owner, 'Some School')
      const { id } = created.body as { id: string }

      expect((await as(owner, server().delete(`/organizations/${id}`))).status).toBe(204)
      expect(await context.db.organization.count()).toBe(0)
    })

    it('answers 409 when the organization still has a unit', async () => {
      const created = await createOrg(owner, 'Some School')
      const { id } = created.body as { id: string }

      await context.db.unit.create({ data: { organizationId: id, name: 'Centro', slug: 'centro' } })

      const response = await as(owner, server().delete(`/organizations/${id}`))

      expect(response.status).toBe(409)
      expect(await context.db.organization.count()).toBe(1)
    })
  })
})
