import { MemberRole } from '@prisma/client'
import request from 'supertest'
import { createTestApp, TestContext } from './support/app'
import { registerAndLogin, TestSession } from './support/auth'
import { truncateAll } from './support/database'

describe('Unit members (e2e)', () => {
  let context: TestContext
  let admin: TestSession
  let teacher: TestSession
  let unitId: string
  let adminMemberId: string
  let teacherMemberId: string

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const patchRoles = (session: TestSession, memberId: string, roles: MemberRole[]) =>
    as(session, server().patch(`/units/${unitId}/members/${memberId}/roles`)).send({ roles })

  const patchStatus = (session: TestSession, memberId: string, isActive: boolean) =>
    as(session, server().patch(`/units/${unitId}/members/${memberId}/status`)).send({ isActive })

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    admin = await registerAndLogin(context)
    teacher = await registerAndLogin(context)

    const organization = await as(admin, server().post('/organizations')).send({ name: 'IFRN' })
    const { id: organizationId } = organization.body as { id: string }

    const unit = await as(admin, server().post(`/organizations/${organizationId}/units`)).send({
      name: 'Campus Natal',
    })
    unitId = (unit.body as { id: string }).id

    adminMemberId = (await context.db.unitMember.findFirstOrThrow({ where: { unitId } })).id
    teacherMemberId = (
      await context.db.unitMember.create({
        data: { unitId, userId: teacher.userId, roles: [MemberRole.TEACHER] },
      })
    ).id
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('listing', () => {
    it('requires management, so a TEACHER cannot list', async () => {
      const response = await as(teacher, server().get(`/units/${unitId}/members`))

      expect(response.status).toBe(403)
    })

    it('filters by role', async () => {
      const response = await as(admin, server().get(`/units/${unitId}/members?role=TEACHER`))
      const body = response.body as { id: string }[]

      expect(body).toHaveLength(1)
      expect(body[0].id).toBe(teacherMemberId)
    })

    it('lists only active members by default', async () => {
      await patchStatus(admin, teacherMemberId, false)

      const response = await as(admin, server().get(`/units/${unitId}/members`))
      const body = response.body as { id: string }[]

      expect(body.map((member) => member.id)).toEqual([adminMemberId])
    })

    it('lists the inactive ones when asked', async () => {
      await patchStatus(admin, teacherMemberId, false)

      const response = await as(admin, server().get(`/units/${unitId}/members?active=false`))
      const body = response.body as { id: string }[]

      expect(body.map((member) => member.id)).toEqual([teacherMemberId])
    })

    it('answers 400 for a role that does not exist', async () => {
      const response = await as(admin, server().get(`/units/${unitId}/members?role=PRINCIPAL`))

      expect(response.status).toBe(400)
    })

    it('never leaks members from another unit', async () => {
      const other = await registerAndLogin(context)
      const organization = await as(other, server().post('/organizations')).send({ name: 'UFRN' })
      const { id } = organization.body as { id: string }
      const otherUnit = await as(other, server().post(`/organizations/${id}/units`)).send({
        name: 'Campus Central',
      })
      const otherUnitId = (otherUnit.body as { id: string }).id

      const response = await as(other, server().get(`/units/${otherUnitId}/members`))
      const body = response.body as { id: string }[]

      expect(body).toHaveLength(1)
      expect(body.map((member) => member.id)).not.toContain(teacherMemberId)
    })
  })

  describe('select', () => {
    it('is readable by a plain TEACHER and carries no e-mail', async () => {
      const response = await as(teacher, server().get(`/units/${unitId}/members/select`))
      const [first] = response.body as Record<string, unknown>[]

      expect(response.status).toBe(200)
      expect(Object.keys(first).sort()).toEqual(['id', 'roles', 'user'])
      expect(JSON.stringify(response.body)).not.toContain('@')
    })
  })

  describe('changing a member', () => {
    it('refuses a COORDINATOR trying to change roles', async () => {
      await context.db.unitMember.update({
        where: { id: teacherMemberId },
        data: { roles: [MemberRole.COORDINATOR] },
      })

      const response = await patchRoles(teacher, adminMemberId, [MemberRole.TEACHER])

      expect(response.status).toBe(403)
    })

    it('answers 400 for a member left with no role', async () => {
      const response = await patchRoles(admin, teacherMemberId, [])

      expect(response.status).toBe(400)
    })

    it('lets management change someone else’s roles', async () => {
      const response = await patchRoles(admin, teacherMemberId, [
        MemberRole.COORDINATOR,
        MemberRole.TEACHER,
      ])

      expect(response.status).toBe(200)
      expect((response.body as { roles: MemberRole[] }).roles).toEqual(['COORDINATOR', 'TEACHER'])
    })

    it('answers 404 for a member of another unit', async () => {
      const other = await registerAndLogin(context)
      const organization = await as(other, server().post('/organizations')).send({ name: 'UFPB' })
      const { id } = organization.body as { id: string }
      const otherUnit = await as(other, server().post(`/organizations/${id}/units`)).send({
        name: 'Campus I',
      })
      const outsider = await context.db.unitMember.findFirstOrThrow({
        where: { unitId: (otherUnit.body as { id: string }).id },
      })

      const response = await patchRoles(admin, outsider.id, [MemberRole.TEACHER])

      expect(response.status).toBe(404)
    })
  })

  describe('roles of an inactive member', () => {
    it('answers 409, asking for reactivation first', async () => {
      await patchStatus(admin, teacherMemberId, false)

      const response = await patchRoles(admin, teacherMemberId, [MemberRole.COORDINATOR])

      expect(response.status).toBe(409)
    })

    it('works again once the member is back', async () => {
      await patchStatus(admin, teacherMemberId, false)
      await patchStatus(admin, teacherMemberId, true)

      const response = await patchRoles(admin, teacherMemberId, [MemberRole.COORDINATOR])

      expect(response.status).toBe(200)
    })
  })

  describe('protecting your own access', () => {
    it('refuses dropping your own ADMIN role', async () => {
      const response = await patchRoles(admin, adminMemberId, [MemberRole.TEACHER])

      expect(response.status).toBe(409)
    })

    it('refuses deactivating yourself', async () => {
      const response = await patchStatus(admin, adminMemberId, false)

      expect(response.status).toBe(409)
    })
  })

  describe('deactivating', () => {
    it('takes effect on the asserts immediately', async () => {
      const before = await as(teacher, server().get(`/units/${unitId}`))

      expect(before.status).toBe(200)

      await patchStatus(admin, teacherMemberId, false)

      const after = await as(teacher, server().get(`/units/${unitId}`))

      expect(after.status).toBe(403)
    })
  })
})
