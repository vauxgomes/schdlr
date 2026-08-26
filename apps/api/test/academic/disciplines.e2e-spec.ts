import { LocationType, MemberRole } from '@prisma/client'
import request from 'supertest'

import { createTestApp, TestContext } from '../support/app'
import { registerAndLogin, TestSession } from '../support/auth'
import { truncateAll } from '../support/database'
import { createOrganization, createUnit } from '../support/factories'

type Discipline = {
  id: string
  name: string
  code: string
  workload: number
  requiredLocationType: LocationType | null
  color: string | null
  isActive: boolean
}

describe('Disciplines (e2e)', () => {
  let context: TestContext
  let admin: TestSession
  let teacher: TestSession
  let unitId: string

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const createDiscipline = (session: TestSession, body: Record<string, unknown>) =>
    as(session, server().post(`/units/${unitId}/disciplines`)).send(body)

  const valid = { name: 'Object Oriented Programming', code: 'POO', workload: 80 }

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

    await context.db.unitMember.create({
      data: { unitId, userId: teacher.userId, roles: [MemberRole.TEACHER] },
    })
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('creating', () => {
    it('creates a discipline with its own fields', async () => {
      const response = await createDiscipline(admin, {
        ...valid,
        color: '#ff8800',
        requiredLocationType: LocationType.COMPUTER_LAB,
      })

      expect(response.status).toBe(201)
      expect(response.body as Discipline).toMatchObject({
        code: 'POO',
        workload: 80,
        color: '#ff8800',
        requiredLocationType: LocationType.COMPUTER_LAB,
        isActive: true,
      })
    })

    it('takes null as "any location will do"', async () => {
      const response = await createDiscipline(admin, { ...valid, requiredLocationType: null })

      expect(response.status).toBe(201)
      expect((response.body as Discipline).requiredLocationType).toBeNull()
    })

    it('omits requiredLocationType entirely and still creates', async () => {
      const response = await createDiscipline(admin, valid)

      expect(response.status).toBe(201)
      expect((response.body as Discipline).requiredLocationType).toBeNull()
    })

    it('answers 400 for a location type outside the enum', async () => {
      const response = await createDiscipline(admin, { ...valid, requiredLocationType: 'HANGAR' })

      expect(response.status).toBe(400)
    })

    it.each([0, -10, 1.5])('answers 400 for workload %p', async (workload) => {
      const response = await createDiscipline(admin, { ...valid, workload })

      expect(response.status).toBe(400)
    })

    it('answers 409 for a code already taken in the unit', async () => {
      await createDiscipline(admin, valid)

      const response = await createDiscipline(admin, { ...valid, name: 'Another one' })

      expect(response.status).toBe(409)
    })

    it('accepts the same code in another unit', async () => {
      await createDiscipline(admin, valid)

      const foreignUnit = await createUnit(context.db)
      const discipline = await context.db.discipline.create({
        data: { unitId: foreignUnit.id, name: valid.name, code: valid.code, workload: 80 },
      })

      expect(discipline.code).toBe('POO')
    })

    it('refuses a TEACHER', async () => {
      const response = await createDiscipline(teacher, valid)

      expect(response.status).toBe(403)
    })
  })

  describe('reading', () => {
    beforeEach(async () => {
      await createDiscipline(admin, { ...valid, color: '#ff8800' })
      await createDiscipline(admin, { name: 'Databases', code: 'BD', workload: 60 })
    })

    it('paginates the listing', async () => {
      const response = await as(admin, server().get(`/units/${unitId}/disciplines?page=1&limit=1`))
      const body = response.body as { items: Discipline[]; total: number; limit: number }

      expect(body).toMatchObject({ total: 2, limit: 1 })
      expect(body.items.map((discipline) => discipline.code)).toEqual(['BD'])
    })

    it('returns id, name, code and color in select', async () => {
      const response = await as(teacher, server().get(`/units/${unitId}/disciplines/select`))
      const body = response.body as Discipline[]

      expect(response.status).toBe(200)
      expect(body).toHaveLength(2)
      expect(Object.keys(body[0]).sort()).toEqual(['code', 'color', 'id', 'name'])
    })
  })

  describe('updating', () => {
    let disciplineId: string

    beforeEach(async () => {
      const created = await createDiscipline(admin, valid)
      disciplineId = (created.body as Discipline).id
    })

    it('updates the workload', async () => {
      const response = await as(
        admin,
        server().patch(`/units/${unitId}/disciplines/${disciplineId}`),
      ).send({ workload: 120 })

      expect(response.status).toBe(200)
      expect((response.body as Discipline).workload).toBe(120)
    })

    it('refuses a TEACHER', async () => {
      const response = await as(
        teacher,
        server().patch(`/units/${unitId}/disciplines/${disciplineId}`),
      ).send({ workload: 120 })

      expect(response.status).toBe(403)
    })
  })

  describe('deleting', () => {
    let disciplineId: string

    beforeEach(async () => {
      const created = await createDiscipline(admin, valid)
      disciplineId = (created.body as Discipline).id
    })

    it('deletes a discipline that no curriculum uses', async () => {
      const response = await as(
        admin,
        server().delete(`/units/${unitId}/disciplines/${disciplineId}`),
      )

      expect(response.status).toBe(204)
    })

    it('answers 409 for a discipline that belongs to a curriculum', async () => {
      const course = await context.db.course.create({
        data: { unitId, name: 'Systems Analysis', code: 'TADS' },
      })
      const curriculum = await context.db.curriculum.create({
        data: { unitId, courseId: course.id, name: '2026.1' },
      })

      await context.db.curriculumDiscipline.create({
        data: { unitId, curriculumId: curriculum.id, disciplineId, level: 1, weeklyLessons: 4 },
      })

      const response = await as(
        admin,
        server().delete(`/units/${unitId}/disciplines/${disciplineId}`),
      )

      expect(response.status).toBe(409)
      expect(await context.db.discipline.count({ where: { id: disciplineId } })).toBe(1)
    })
  })

  describe('tenant isolation', () => {
    let foreignDisciplineId: string

    beforeEach(async () => {
      const organization = await createOrganization(context.db)
      const foreignUnit = await createUnit(context.db, { organizationId: organization.id })

      foreignDisciplineId = (
        await context.db.discipline.create({
          data: { unitId: foreignUnit.id, name: 'Foreign', code: 'FOR', workload: 40 },
        })
      ).id
    })

    it('does not read a discipline from another unit', async () => {
      const response = await as(
        admin,
        server().get(`/units/${unitId}/disciplines/${foreignDisciplineId}`),
      )

      expect(response.status).toBe(404)
    })

    it('does not update a discipline from another unit', async () => {
      const response = await as(
        admin,
        server().patch(`/units/${unitId}/disciplines/${foreignDisciplineId}`),
      ).send({ workload: 999 })

      expect(response.status).toBe(404)
    })

    it('does not delete a discipline from another unit', async () => {
      const response = await as(
        admin,
        server().delete(`/units/${unitId}/disciplines/${foreignDisciplineId}`),
      )

      expect(response.status).toBe(404)
      expect(await context.db.discipline.count({ where: { id: foreignDisciplineId } })).toBe(1)
    })
  })
})
