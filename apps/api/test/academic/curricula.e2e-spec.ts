import { MemberRole } from '@prisma/client'
import request from 'supertest'

import { createTestApp, TestContext } from '../support/app'
import { registerAndLogin, TestSession } from '../support/auth'
import { truncateAll } from '../support/database'
import { createOrganization, createUnit } from '../support/factories'

type Curriculum = { id: string; name: string; isActive: boolean }
type Item = { id: string; level: number; weeklyLessons: number; isRequired: boolean }
type Level = { level: number; items: (Item & { discipline: { code: string } })[] }

describe('Curricula (e2e)', () => {
  let context: TestContext
  let admin: TestSession
  let teacher: TestSession
  let unitId: string
  let courseId: string
  let curriculumId: string
  let disciplineId: string

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const curricula = (course = courseId) => `/units/${unitId}/courses/${course}/curricula`
  const grade = (curriculum = curriculumId) => `${curricula()}/${curriculum}/disciplines`

  const addToGrade = (session: TestSession, body: Record<string, unknown>) =>
    as(session, server().post(grade())).send(body)

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

    courseId = (
      await context.db.course.create({
        data: { unitId, name: 'Systems Analysis', code: 'TADS' },
      })
    ).id

    curriculumId = (
      await context.db.curriculum.create({ data: { unitId, courseId, name: '2026.1' } })
    ).id

    disciplineId = (
      await context.db.discipline.create({
        data: { unitId, name: 'Object Oriented Programming', code: 'POO', workload: 80 },
      })
    ).id
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('the curriculum', () => {
    it('creates one under the course', async () => {
      const response = await as(admin, server().post(curricula())).send({ name: '2027.1' })

      expect(response.status).toBe(201)
      expect(response.body as Curriculum).toMatchObject({ name: '2027.1', isActive: true })
    })

    it('answers 409 for a name already used in the course', async () => {
      const response = await as(admin, server().post(curricula())).send({ name: '2026.1' })

      expect(response.status).toBe(409)
    })

    it('answers 404 for a course from another unit, not a database error', async () => {
      const foreignUnit = await createUnit(context.db, {
        organizationId: (await createOrganization(context.db)).id,
      })
      const foreignCourse = await context.db.course.create({
        data: { unitId: foreignUnit.id, name: 'Foreign', code: 'FOR' },
      })

      const response = await as(admin, server().post(curricula(foreignCourse.id))).send({
        name: '2026.1',
      })

      expect(response.status).toBe(404)
      expect(await context.db.curriculum.count({ where: { courseId: foreignCourse.id } })).toBe(0)
    })

    it('does not reach a curriculum through another course', async () => {
      const other = await context.db.course.create({
        data: { unitId, name: 'Computer Networks', code: 'REDES' },
      })

      const response = await as(admin, server().get(`${curricula(other.id)}/${curriculumId}`))

      expect(response.status).toBe(404)
    })

    it('refuses a TEACHER', async () => {
      const response = await as(teacher, server().post(curricula())).send({ name: '2027.1' })

      expect(response.status).toBe(403)
    })

    it('answers 409 when deleting one that already has a project', async () => {
      const member = await context.db.unitMember.findFirstOrThrow({
        where: { unitId, userId: admin.userId },
      })
      const term = await context.db.term.create({
        data: {
          unitId,
          name: '2026.1',
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-07-01'),
        },
      })

      await context.db.project.create({
        data: {
          unitId,
          termId: term.id,
          curriculumId,
          createdById: member.id,
          name: 'TADS 2026.1',
        },
      })

      const response = await as(admin, server().delete(`${curricula()}/${curriculumId}`))

      expect(response.status).toBe(409)
    })

    it('deletes one that was never executed, taking its grade along', async () => {
      await addToGrade(admin, { disciplineId, level: 1, weeklyLessons: 4 })

      const response = await as(admin, server().delete(`${curricula()}/${curriculumId}`))

      expect(response.status).toBe(204)
      expect(await context.db.curriculumDiscipline.count({ where: { curriculumId } })).toBe(0)
    })
  })

  describe('the grade', () => {
    it('adds a discipline with its level and weekly lessons', async () => {
      const response = await addToGrade(admin, { disciplineId, level: 2, weeklyLessons: 4 })

      expect(response.status).toBe(201)
      expect(response.body as Item).toMatchObject({ level: 2, weeklyLessons: 4, isRequired: true })
    })

    it('answers 409 for the same discipline twice', async () => {
      await addToGrade(admin, { disciplineId, level: 1, weeklyLessons: 4 })

      const response = await addToGrade(admin, { disciplineId, level: 3, weeklyLessons: 2 })

      expect(response.status).toBe(409)
    })

    it('answers 404 for a discipline from another unit', async () => {
      const foreignUnit = await createUnit(context.db)
      const foreign = await context.db.discipline.create({
        data: { unitId: foreignUnit.id, name: 'Foreign', code: 'FOR', workload: 40 },
      })

      const response = await addToGrade(admin, {
        disciplineId: foreign.id,
        level: 1,
        weeklyLessons: 4,
      })

      expect(response.status).toBe(404)
    })

    it.each([
      ['level', { level: 0, weeklyLessons: 4 }],
      ['level', { level: -1, weeklyLessons: 4 }],
      ['weeklyLessons', { level: 1, weeklyLessons: 0 }],
      ['weeklyLessons', { level: 1, weeklyLessons: 2.5 }],
    ])('answers 400 for an invalid %s', async (_field, body) => {
      const response = await addToGrade(admin, { disciplineId, ...body })

      expect(response.status).toBe(400)
    })

    it('groups the listing by level, in order', async () => {
      const second = await context.db.discipline.create({
        data: { unitId, name: 'Algorithms', code: 'ALG', workload: 60 },
      })
      const third = await context.db.discipline.create({
        data: { unitId, name: 'Databases', code: 'BD', workload: 60 },
      })

      await addToGrade(admin, { disciplineId: third.id, level: 2, weeklyLessons: 2 })
      await addToGrade(admin, { disciplineId, level: 1, weeklyLessons: 4 })
      await addToGrade(admin, { disciplineId: second.id, level: 1, weeklyLessons: 6 })

      const response = await as(teacher, server().get(grade()))
      const body = response.body as Level[]

      expect(body.map((entry) => entry.level)).toEqual([1, 2])
      expect(body[0].items.map((item) => item.discipline.code)).toEqual(['ALG', 'POO'])
      expect(body[1].items.map((item) => item.discipline.code)).toEqual(['BD'])
    })

    it('updates the weekly lessons of an item', async () => {
      const created = await addToGrade(admin, { disciplineId, level: 1, weeklyLessons: 4 })
      const { id } = created.body as Item

      const response = await as(admin, server().patch(`${grade()}/${id}`)).send({
        weeklyLessons: 6,
        isRequired: false,
      })

      expect(response.status).toBe(200)
      expect(response.body as Item).toMatchObject({ weeklyLessons: 6, isRequired: false })
    })

    it('removes an item that has no offer', async () => {
      const created = await addToGrade(admin, { disciplineId, level: 1, weeklyLessons: 4 })
      const { id } = created.body as Item

      const response = await as(admin, server().delete(`${grade()}/${id}`))

      expect(response.status).toBe(204)
    })

    it('answers 409 when the item already has an offer', async () => {
      const created = await addToGrade(admin, { disciplineId, level: 1, weeklyLessons: 4 })
      const { id } = created.body as Item

      const member = await context.db.unitMember.findFirstOrThrow({
        where: { unitId, userId: admin.userId },
      })
      const term = await context.db.term.create({
        data: {
          unitId,
          name: '2026.1',
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-07-01'),
        },
      })
      const project = await context.db.project.create({
        data: { unitId, termId: term.id, curriculumId, createdById: member.id, name: 'TADS' },
      })

      await context.db.offer.create({
        data: { unitId, projectId: project.id, curriculumDisciplineId: id },
      })

      const response = await as(admin, server().delete(`${grade()}/${id}`))

      expect(response.status).toBe(409)
    })

    it('refuses a TEACHER', async () => {
      const response = await addToGrade(teacher, { disciplineId, level: 1, weeklyLessons: 4 })

      expect(response.status).toBe(403)
    })

    it('does not reach an item through a curriculum from another course', async () => {
      const created = await addToGrade(admin, { disciplineId, level: 1, weeklyLessons: 4 })
      const { id } = created.body as Item

      const other = await context.db.course.create({
        data: { unitId, name: 'Computer Networks', code: 'REDES' },
      })
      const otherCurriculum = await context.db.curriculum.create({
        data: { unitId, courseId: other.id, name: '2026.1' },
      })

      const response = await as(
        admin,
        server().delete(`${curricula(other.id)}/${otherCurriculum.id}/disciplines/${id}`),
      )

      expect(response.status).toBe(404)
      expect(await context.db.curriculumDiscipline.count({ where: { id } })).toBe(1)
    })
  })
})
