import { MemberRole } from '@prisma/client'
import request from 'supertest'

import { createTestApp, TestContext } from '../support/app'
import { registerAndLogin, TestSession } from '../support/auth'
import { truncateAll } from '../support/database'

describe('Units and permissions (e2e)', () => {
  let context: TestContext
  let owner: TestSession
  let stranger: TestSession
  let organizationId: string
  let unitId: string

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const createUnit = (session: TestSession, organization: string, name: string) =>
    as(session, server().post(`/organizations/${organization}/units`)).send({ name })

  // Coloca alguém na unidade com os papéis pedidos, que é o que a 0009 fará
  // por rota — aqui só o guard precisa enxergar a linha.
  const join = (session: TestSession, roles: MemberRole[], isActive = true) =>
    context.db.unitMember.create({ data: { userId: session.userId, unitId, roles, isActive } })

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    owner = await registerAndLogin(context)
    stranger = await registerAndLogin(context)

    const organization = await as(owner, server().post('/organizations')).send({ name: 'IFRN' })
    organizationId = (organization.body as { id: string }).id

    const unit = await createUnit(owner, organizationId, 'Campus Natal')
    unitId = (unit.body as { id: string }).id
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('creating a unit', () => {
    it('leaves the organization owner as an active ADMIN member', async () => {
      const member = await context.db.unitMember.findFirstOrThrow({ where: { unitId } })

      expect(member.userId).toBe(owner.userId)
      expect(member.roles).toEqual([MemberRole.ADMIN])
      expect(member.isActive).toBe(true)
    })

    it('answers 409 for a repeated slug in the same organization', async () => {
      const again = await createUnit(owner, organizationId, 'Campus Natal')

      expect(again.status).toBe(409)
    })

    it('accepts the same slug in a different organization', async () => {
      const other = await as(owner, server().post('/organizations')).send({ name: 'UFRN' })
      const { id } = other.body as { id: string }

      const unit = await createUnit(owner, id, 'Campus Natal')

      expect(unit.status).toBe(201)
    })

    it('refuses someone who does not own the organization', async () => {
      const response = await createUnit(stranger, organizationId, 'Campus Zona Norte')

      expect(response.status).toBe(403)
    })
  })

  describe('the guard', () => {
    it('answers 404 for a unit that does not exist, not 403', async () => {
      const response = await as(owner, server().get('/units/does-not-exist'))

      expect(response.status).toBe(404)
    })

    it('leaves routes without :unitId alone', async () => {
      const select = await as(stranger, server().get('/units/select'))
      const me = await as(stranger, server().get('/me'))

      expect(select.status).toBe(200)
      expect(me.status).toBe(200)
    })

    it('lists in /select only what the person reaches', async () => {
      const mine = await as(owner, server().get('/units/select'))
      const theirs = await as(stranger, server().get('/units/select'))

      expect((mine.body as unknown[]).length).toBe(1)
      expect(theirs.body).toEqual([])
    })
  })

  describe('the asserts', () => {
    it('lets the owner in even with no member row of their own', async () => {
      await context.db.unitMember.deleteMany({ where: { unitId } })

      const read = await as(owner, server().get(`/units/${unitId}`))
      const write = await as(owner, server().patch(`/units/${unitId}`)).send({ name: 'Natal' })

      expect(read.status).toBe(200)
      expect(write.status).toBe(200)
    })

    it('answers 403 for someone who is neither member nor owner', async () => {
      const response = await as(stranger, server().get(`/units/${unitId}`))

      expect(response.status).toBe(403)
    })

    it('answers 403 for a member who is no longer active', async () => {
      await join(stranger, [MemberRole.MANAGER], false)

      const response = await as(stranger, server().get(`/units/${unitId}`))

      expect(response.status).toBe(403)
    })

    it('lets a TEACHER read but not manage', async () => {
      await join(stranger, [MemberRole.TEACHER])

      const read = await as(stranger, server().get(`/units/${unitId}`))
      const write = await as(stranger, server().patch(`/units/${unitId}`)).send({ name: 'Nope' })

      expect(read.status).toBe(200)
      expect(write.status).toBe(403)
    })

    it('lets a MANAGER manage', async () => {
      await join(stranger, [MemberRole.MANAGER])

      const write = await as(stranger, server().patch(`/units/${unitId}`)).send({ name: 'Natal' })

      expect(write.status).toBe(200)
    })
  })

  describe('deleting a unit', () => {
    it('deletes when the owner is the only member', async () => {
      const response = await as(owner, server().delete(`/units/${unitId}`))

      expect(response.status).toBe(204)
      expect(await context.db.unit.count()).toBe(0)
    })

    it('answers 409 when another member is still active', async () => {
      await join(stranger, [MemberRole.TEACHER])

      const response = await as(owner, server().delete(`/units/${unitId}`))

      expect(response.status).toBe(409)
      expect(await context.db.unit.count()).toBe(1)
    })

    it('deletes when the other members are already inactive', async () => {
      await join(stranger, [MemberRole.TEACHER], false)

      const response = await as(owner, server().delete(`/units/${unitId}`))

      expect(response.status).toBe(204)
    })
  })
})
