import { MemberRole } from '@prisma/client'
import request from 'supertest'

import { createTestApp, TestContext } from '../support/app'
import { registerAndLogin, TestSession } from '../support/auth'
import { truncateAll } from '../support/database'
import { createOrganization, createUnit } from '../support/factories'

type Course = { id: string; name: string; code: string; isActive: boolean }

describe('Courses (e2e)', () => {
  let context: TestContext
  let admin: TestSession
  let teacher: TestSession
  let organizationId: string
  let unitId: string

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const createCourse = (session: TestSession, body: Record<string, unknown>) =>
    as(session, server().post(`/units/${unitId}/courses`)).send(body)

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    admin = await registerAndLogin(context)
    teacher = await registerAndLogin(context)

    const organization = await as(admin, server().post('/organizations')).send({ name: 'IFRN' })
    organizationId = (organization.body as { id: string }).id

    const unit = await as(admin, server().post(`/organizations/${organizationId}/units`)).send({
      name: 'Campus Natal',
    })
    unitId = (unit.body as { id: string }).id

    await context.db.unitMember.create({
      data: { unitId, userId: teacher.userId, roles: [MemberRole.TEACHER] },
    })
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('creating', () => {
    it('creates a course under the unit', async () => {
      const response = await createCourse(admin, { name: 'Systems Analysis', code: 'tads' })
      const body = response.body as Course

      expect(response.status).toBe(201)
      // O código é normalizado na entrada: o unique do banco distingue caixa.
      expect(body).toMatchObject({ name: 'Systems Analysis', code: 'TADS', isActive: true })
    })

    it('answers 409 for a code already taken in the unit', async () => {
      await createCourse(admin, { name: 'Systems Analysis', code: 'TADS' })

      const response = await createCourse(admin, { name: 'Another one', code: 'TADS' })

      expect(response.status).toBe(409)
    })

    it('accepts the same code in another unit', async () => {
      await createCourse(admin, { name: 'Systems Analysis', code: 'TADS' })

      const other = await as(admin, server().post(`/organizations/${organizationId}/units`)).send({
        name: 'Campus Parnamirim',
      })
      const otherUnitId = (other.body as { id: string }).id

      const response = await as(admin, server().post(`/units/${otherUnitId}/courses`)).send({
        name: 'Systems Analysis',
        code: 'TADS',
      })

      expect(response.status).toBe(201)
    })

    it('answers 400 for a body the schema refuses', async () => {
      const response = await createCourse(admin, { name: 'x', code: '' })

      expect(response.status).toBe(400)
    })

    it('refuses a TEACHER', async () => {
      const response = await createCourse(teacher, { name: 'Systems Analysis', code: 'TADS' })

      expect(response.status).toBe(403)
    })
  })

  describe('reading', () => {
    beforeEach(async () => {
      await createCourse(admin, { name: 'Systems Analysis', code: 'TADS' })
      await createCourse(admin, { name: 'Computer Networks', code: 'REDES' })
    })

    it('paginates the listing', async () => {
      const response = await as(admin, server().get(`/units/${unitId}/courses?page=2&limit=1`))
      const body = response.body as { items: Course[]; total: number; page: number; limit: number }

      expect(body).toMatchObject({ total: 2, page: 2, limit: 1 })
      expect(body.items.map((course) => course.code)).toEqual(['TADS'])
    })

    it('lists only the active ones by default', async () => {
      const created = await createCourse(admin, { name: 'Retired', code: 'OLD' })
      const { id } = created.body as Course

      await as(admin, server().patch(`/units/${unitId}/courses/${id}`)).send({ isActive: false })

      const response = await as(admin, server().get(`/units/${unitId}/courses`))
      const body = response.body as { items: Course[]; total: number }

      expect(body.total).toBe(2)
      expect(body.items.map((course) => course.code)).not.toContain('OLD')
    })

    it('answers 400 for a page that is not a number', async () => {
      const response = await as(admin, server().get(`/units/${unitId}/courses?page=first`))

      expect(response.status).toBe(400)
    })

    it('lets a TEACHER read', async () => {
      const response = await as(teacher, server().get(`/units/${unitId}/courses`))

      expect(response.status).toBe(200)
    })

    it('returns only the essentials in select, without paginating', async () => {
      const response = await as(teacher, server().get(`/units/${unitId}/courses/select`))
      const body = response.body as Course[]

      expect(response.status).toBe(200)
      expect(body).toHaveLength(2)
      expect(Object.keys(body[0]).sort()).toEqual(['code', 'id', 'name'])
    })
  })

  describe('updating', () => {
    let courseId: string

    beforeEach(async () => {
      const created = await createCourse(admin, { name: 'Systems Analysis', code: 'TADS' })
      courseId = (created.body as Course).id
    })

    it('updates name and code', async () => {
      const response = await as(admin, server().patch(`/units/${unitId}/courses/${courseId}`)).send(
        {
          name: 'Systems Analysis and Development',
        },
      )

      expect(response.status).toBe(200)
      expect((response.body as Course).name).toBe('Systems Analysis and Development')
    })

    it('answers 409 when the new code is already taken', async () => {
      await createCourse(admin, { name: 'Computer Networks', code: 'REDES' })

      const response = await as(admin, server().patch(`/units/${unitId}/courses/${courseId}`)).send(
        {
          code: 'REDES',
        },
      )

      expect(response.status).toBe(409)
    })

    it('refuses a TEACHER', async () => {
      const response = await as(
        teacher,
        server().patch(`/units/${unitId}/courses/${courseId}`),
      ).send({ name: 'Nope' })

      expect(response.status).toBe(403)
    })
  })

  describe('deleting', () => {
    let courseId: string

    beforeEach(async () => {
      const created = await createCourse(admin, { name: 'Systems Analysis', code: 'TADS' })
      courseId = (created.body as Course).id
    })

    it('deletes a course that was never used', async () => {
      const response = await as(admin, server().delete(`/units/${unitId}/courses/${courseId}`))

      expect(response.status).toBe(204)
      expect(await context.db.course.count({ where: { id: courseId } })).toBe(0)
    })

    it('answers 409 for a course that already has a curriculum', async () => {
      await context.db.curriculum.create({ data: { unitId, courseId, name: '2026.1' } })

      const response = await as(admin, server().delete(`/units/${unitId}/courses/${courseId}`))

      expect(response.status).toBe(409)
    })

    it('refuses a TEACHER', async () => {
      const response = await as(teacher, server().delete(`/units/${unitId}/courses/${courseId}`))

      expect(response.status).toBe(403)
    })
  })

  // Vazamento entre unidades é silencioso: a resposta viria 200 com o dado do
  // vizinho. Cada rota que recebe :courseId precisa provar que não vaza.
  describe('tenant isolation', () => {
    let foreignCourseId: string

    beforeEach(async () => {
      const organization = await createOrganization(context.db)
      const foreignUnit = await createUnit(context.db, { organizationId: organization.id })

      foreignCourseId = (
        await context.db.course.create({
          data: { unitId: foreignUnit.id, name: 'Foreign', code: 'FOR' },
        })
      ).id
    })

    it('does not read a course from another unit', async () => {
      const response = await as(admin, server().get(`/units/${unitId}/courses/${foreignCourseId}`))

      expect(response.status).toBe(404)
    })

    it('does not update a course from another unit', async () => {
      const response = await as(
        admin,
        server().patch(`/units/${unitId}/courses/${foreignCourseId}`),
      ).send({ name: 'Mine now' })

      expect(response.status).toBe(404)
      expect(
        (await context.db.course.findUniqueOrThrow({ where: { id: foreignCourseId } })).name,
      ).toBe('Foreign')
    })

    it('does not delete a course from another unit', async () => {
      const response = await as(
        admin,
        server().delete(`/units/${unitId}/courses/${foreignCourseId}`),
      )

      expect(response.status).toBe(404)
      expect(await context.db.course.count({ where: { id: foreignCourseId } })).toBe(1)
    })

    it('does not list courses from another unit', async () => {
      await createCourse(admin, { name: 'Systems Analysis', code: 'TADS' })

      const response = await as(admin, server().get(`/units/${unitId}/courses`))
      const body = response.body as { items: Course[]; total: number }

      expect(body.total).toBe(1)
      expect(body.items.map((course) => course.code)).toEqual(['TADS'])
    })
  })
})
