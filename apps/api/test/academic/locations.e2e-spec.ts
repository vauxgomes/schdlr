import { LocationType, MemberRole } from '@prisma/client'
import request from 'supertest'

import { createTestApp, TestContext } from '../support/app'
import { registerAndLogin, TestSession } from '../support/auth'
import { truncateAll } from '../support/database'
import { createOrganization, createUnit } from '../support/factories'

type Location = {
  id: string
  name: string
  type: LocationType
  capacity: number | null
  isActive: boolean
}

describe('Locations (e2e)', () => {
  let context: TestContext
  let admin: TestSession
  let teacher: TestSession
  let unitId: string

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const createLocation = (session: TestSession, body: Record<string, unknown>) =>
    as(session, server().post(`/units/${unitId}/locations`)).send(body)

  const valid = { name: 'Sala 101', type: LocationType.CLASSROOM }

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
    it('creates a location with capacity', async () => {
      const response = await createLocation(admin, { ...valid, capacity: 40 })

      expect(response.status).toBe(201)
      expect(response.body as Location).toMatchObject({
        name: 'Sala 101',
        type: LocationType.CLASSROOM,
        capacity: 40,
        isActive: true,
      })
    })

    it('creates a location without capacity', async () => {
      const response = await createLocation(admin, valid)

      expect(response.status).toBe(201)
      expect((response.body as Location).capacity).toBeNull()
    })

    it.each([0, -5])('answers 400 for capacity %p', async (capacity) => {
      const response = await createLocation(admin, { ...valid, capacity })

      expect(response.status).toBe(400)
    })

    it('answers 400 for a type outside the enum', async () => {
      const response = await createLocation(admin, { name: 'Sala 101', type: 'HANGAR' })

      expect(response.status).toBe(400)
    })

    it('answers 409 for a name already taken in the unit', async () => {
      await createLocation(admin, valid)

      const response = await createLocation(admin, { ...valid, type: LocationType.LAB })

      expect(response.status).toBe(409)
    })

    it('accepts the same name in another unit', async () => {
      await createLocation(admin, valid)

      const foreignUnit = await createUnit(context.db)
      const location = await context.db.location.create({
        data: { unitId: foreignUnit.id, name: valid.name, type: LocationType.CLASSROOM },
      })

      expect(location.name).toBe('Sala 101')
    })

    it('refuses a TEACHER', async () => {
      const response = await createLocation(teacher, valid)

      expect(response.status).toBe(403)
    })
  })

  describe('reading', () => {
    beforeEach(async () => {
      await createLocation(admin, { ...valid, capacity: 40 })
      await createLocation(admin, { name: 'Lab de Redes', type: LocationType.LAB })
    })

    it('paginates the listing', async () => {
      const response = await as(admin, server().get(`/units/${unitId}/locations?page=2&limit=1`))
      const body = response.body as { items: Location[]; total: number; page: number }

      expect(body).toMatchObject({ total: 2, page: 2 })
      expect(body.items.map((location) => location.name)).toEqual(['Sala 101'])
    })

    it('returns id, name, type and capacity in select', async () => {
      const response = await as(teacher, server().get(`/units/${unitId}/locations/select`))
      const body = response.body as Location[]

      expect(response.status).toBe(200)
      expect(body).toHaveLength(2)
      expect(Object.keys(body[0]).sort()).toEqual(['capacity', 'id', 'name', 'type'])
    })
  })

  describe('updating and deleting', () => {
    let locationId: string

    beforeEach(async () => {
      const created = await createLocation(admin, valid)
      locationId = (created.body as Location).id
    })

    it('retires a location with isActive', async () => {
      const response = await as(
        admin,
        server().patch(`/units/${unitId}/locations/${locationId}`),
      ).send({ isActive: false })

      expect(response.status).toBe(200)
      expect((response.body as Location).isActive).toBe(false)
    })

    it('refuses a TEACHER', async () => {
      const response = await as(
        teacher,
        server().patch(`/units/${unitId}/locations/${locationId}`),
      ).send({ capacity: 10 })

      expect(response.status).toBe(403)
    })

    it('deletes a location that no schedule uses', async () => {
      const response = await as(admin, server().delete(`/units/${unitId}/locations/${locationId}`))

      expect(response.status).toBe(204)
    })

    it('answers 409 for a location used in a schedule', async () => {
      await putLocationInASchedule(locationId)

      const response = await as(admin, server().delete(`/units/${unitId}/locations/${locationId}`))

      expect(response.status).toBe(409)
      expect(await context.db.location.count({ where: { id: locationId } })).toBe(1)
    })
  })

  describe('tenant isolation', () => {
    let foreignLocationId: string

    beforeEach(async () => {
      const organization = await createOrganization(context.db)
      const foreignUnit = await createUnit(context.db, { organizationId: organization.id })

      foreignLocationId = (
        await context.db.location.create({
          data: { unitId: foreignUnit.id, name: 'Foreign', type: LocationType.CLASSROOM },
        })
      ).id
    })

    it('does not read a location from another unit', async () => {
      const response = await as(
        admin,
        server().get(`/units/${unitId}/locations/${foreignLocationId}`),
      )

      expect(response.status).toBe(404)
    })

    it('does not update a location from another unit', async () => {
      const response = await as(
        admin,
        server().patch(`/units/${unitId}/locations/${foreignLocationId}`),
      ).send({ name: 'Mine now' })

      expect(response.status).toBe(404)
    })

    it('does not delete a location from another unit', async () => {
      const response = await as(
        admin,
        server().delete(`/units/${unitId}/locations/${foreignLocationId}`),
      )

      expect(response.status).toBe(404)
      expect(await context.db.location.count({ where: { id: foreignLocationId } })).toBe(1)
    })

    it('does not list locations from another unit', async () => {
      await createLocation(admin, valid)

      const response = await as(admin, server().get(`/units/${unitId}/locations`))
      const body = response.body as { items: Location[]; total: number }

      expect(body.total).toBe(1)
      expect(body.items.map((location) => location.name)).toEqual(['Sala 101'])
    })
  })

  // O caminho inteiro até o BoardSlot, porque é a FK dele que impede a
  // exclusão: currículo, período, projeto, turma e a célula do quadro.
  async function putLocationInASchedule(locationId: string) {
    const { db } = context
    const member = await db.unitMember.findFirstOrThrow({ where: { unitId, userId: admin.userId } })

    const course = await db.course.create({
      data: { unitId, name: 'Systems Analysis', code: 'TADS' },
    })
    const curriculum = await db.curriculum.create({
      data: { unitId, courseId: course.id, name: '2026.1' },
    })
    const term = await db.term.create({
      data: {
        unitId,
        name: '2026.1',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-07-01'),
      },
    })
    const project = await db.project.create({
      data: {
        unitId,
        termId: term.id,
        curriculumId: curriculum.id,
        createdById: member.id,
        name: 'TADS',
      },
    })
    const timetable = await db.timetable.create({ data: { unitId, name: 'Manhã' } })
    const timeSlot = await db.timeSlot.create({
      data: { unitId, timetableId: timetable.id, name: '1º horário', startTime: 420, endTime: 470 },
    })
    const board = await db.board.create({
      data: { unitId, projectId: project.id, timetableId: timetable.id, name: 'TADS 1', level: 1 },
    })

    await db.boardSlot.create({
      data: { unitId, boardId: board.id, timeSlotId: timeSlot.id, weekDay: 1, locationId },
    })
  }
})
