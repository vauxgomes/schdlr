import { MemberRole } from '@prisma/client'
import request from 'supertest'

import { createTestApp, TestContext } from '../support/app'
import { registerAndLogin, TestSession } from '../support/auth'
import { truncateAll } from '../support/database'
import { createOrganization, createUnit } from '../support/factories'

type Timetable = { id: string; name: string; isActive: boolean }
type Slot = { id: string; name: string; startTime: number; endTime: number; isActive: boolean }

describe('Timetables (e2e)', () => {
  let context: TestContext
  let admin: TestSession
  let teacher: TestSession
  let unitId: string
  let timetableId: string

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const timetables = () => `/units/${unitId}/timetables`
  const slots = (timetable = timetableId) => `${timetables()}/${timetable}/time-slots`

  const createSlot = (session: TestSession, body: Record<string, unknown>, timetable?: string) =>
    as(session, server().post(slots(timetable))).send(body)

  const firstClass = { name: '1º horário', startTime: 420, endTime: 470 }

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

    const timetable = await as(admin, server().post(timetables())).send({ name: 'Manhã' })
    timetableId = (timetable.body as Timetable).id
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('the timetable', () => {
    it('answers 409 for a name already taken in the unit', async () => {
      const response = await as(admin, server().post(timetables())).send({ name: 'Manhã' })

      expect(response.status).toBe(409)
    })

    it('accepts the same name in another unit', async () => {
      const foreignUnit = await createUnit(context.db)
      const timetable = await context.db.timetable.create({
        data: { unitId: foreignUnit.id, name: 'Manhã' },
      })

      expect(timetable.name).toBe('Manhã')
    })

    it('refuses a TEACHER', async () => {
      const response = await as(teacher, server().post(timetables())).send({ name: 'Tarde' })

      expect(response.status).toBe(403)
    })

    it('returns the timetable with its slots in order', async () => {
      await createSlot(admin, { name: '2º horário', startTime: 470, endTime: 520 })
      await createSlot(admin, firstClass)

      const response = await as(teacher, server().get(`${timetables()}/${timetableId}`))
      const body = response.body as Timetable & { timeSlots: Slot[] }

      expect(body.timeSlots.map((slot) => slot.startTime)).toEqual([420, 470])
    })

    it('leaves the slots out of select unless asked', async () => {
      await createSlot(admin, firstClass)

      const bare = await as(teacher, server().get(`${timetables()}/select`))
      const withSlots = await as(teacher, server().get(`${timetables()}/select?withSlots=true`))

      expect(Object.keys((bare.body as Timetable[])[0]).sort()).toEqual(['id', 'name'])
      expect((withSlots.body as (Timetable & { timeSlots: Slot[] })[])[0].timeSlots).toHaveLength(1)
    })

    it('deletes a timetable along with its slots', async () => {
      await createSlot(admin, firstClass)

      const response = await as(admin, server().delete(`${timetables()}/${timetableId}`))

      expect(response.status).toBe(204)
      expect(await context.db.timeSlot.count({ where: { timetableId } })).toBe(0)
    })

    it('answers 409 for a timetable used by a board', async () => {
      await putTimetableInABoard()

      const response = await as(admin, server().delete(`${timetables()}/${timetableId}`))

      expect(response.status).toBe(409)
    })
  })

  describe('the time slots', () => {
    it('creates one', async () => {
      const response = await createSlot(admin, firstClass)

      expect(response.status).toBe(201)
      expect(response.body as Slot).toMatchObject({ startTime: 420, endTime: 470 })
    })

    it('answers 409 for a range overlapping another in the same timetable', async () => {
      await createSlot(admin, firstClass)

      const response = await createSlot(admin, { name: 'Meio', startTime: 450, endTime: 500 })

      expect(response.status).toBe(409)
    })

    it('accepts a range that only touches the previous one', async () => {
      await createSlot(admin, firstClass)

      const response = await createSlot(admin, { name: '2º horário', startTime: 470, endTime: 520 })

      expect(response.status).toBe(201)
    })

    it('accepts the very same range in another timetable', async () => {
      await createSlot(admin, firstClass)

      const other = await as(admin, server().post(timetables())).send({ name: 'Tarde' })
      const otherId = (other.body as Timetable).id

      const response = await createSlot(admin, firstClass, otherId)

      expect(response.status).toBe(201)
    })

    it.each([
      ['endTime equal to startTime', { startTime: 420, endTime: 420 }],
      ['endTime before startTime', { startTime: 470, endTime: 420 }],
      ['a negative startTime', { startTime: -1, endTime: 420 }],
      ['an endTime past midnight', { startTime: 1400, endTime: 1441 }],
      ['a fractional startTime', { startTime: 420.5, endTime: 470 }],
    ])('answers 400 for %s', async (_case, times) => {
      const response = await createSlot(admin, { name: 'Faixa', ...times })

      expect(response.status).toBe(400)
    })

    it('takes 1440 as the end of the day', async () => {
      const response = await createSlot(admin, { name: 'Última', startTime: 1380, endTime: 1440 })

      expect(response.status).toBe(201)
    })

    it('lists the slots ordered by startTime', async () => {
      await createSlot(admin, { name: '3º horário', startTime: 520, endTime: 570 })
      await createSlot(admin, firstClass)
      await createSlot(admin, { name: '2º horário', startTime: 470, endTime: 520 })

      const response = await as(teacher, server().get(slots()))
      const body = response.body as Slot[]

      expect(body.map((slot) => slot.startTime)).toEqual([420, 470, 520])
    })

    it('moves a slot that nothing uses', async () => {
      const created = await createSlot(admin, firstClass)
      const { id } = created.body as Slot

      const response = await as(admin, server().patch(`${slots()}/${id}`)).send({ startTime: 430 })

      expect(response.status).toBe(200)
      expect((response.body as Slot).startTime).toBe(430)
    })

    it('answers 409 when moving a slot onto a sibling', async () => {
      const created = await createSlot(admin, firstClass)
      const { id } = created.body as Slot

      await createSlot(admin, { name: '2º horário', startTime: 470, endTime: 520 })

      const response = await as(admin, server().patch(`${slots()}/${id}`)).send({ endTime: 500 })

      expect(response.status).toBe(409)
    })

    it('answers 400 when the patch would end the slot before it starts', async () => {
      const created = await createSlot(admin, firstClass)
      const { id } = created.body as Slot

      const response = await as(admin, server().patch(`${slots()}/${id}`)).send({ endTime: 400 })

      expect(response.status).toBe(400)
    })

    it('answers 409 when moving a slot that is used in a schedule', async () => {
      const slotId = await putSlotInABoard()

      const response = await as(admin, server().patch(`${slots()}/${slotId}`)).send({
        startTime: 430,
      })

      expect(response.status).toBe(409)
    })

    it('renames a slot that is used in a schedule', async () => {
      const slotId = await putSlotInABoard()

      const response = await as(admin, server().patch(`${slots()}/${slotId}`)).send({
        name: '1ª aula',
      })

      expect(response.status).toBe(200)
    })

    it('answers 409 when deleting a slot that is used in a schedule', async () => {
      const slotId = await putSlotInABoard()

      const response = await as(admin, server().delete(`${slots()}/${slotId}`))

      expect(response.status).toBe(409)
    })

    it('refuses a TEACHER', async () => {
      const response = await createSlot(teacher, firstClass)

      expect(response.status).toBe(403)
    })

    it('does not reach a slot through a timetable from another unit', async () => {
      const created = await createSlot(admin, firstClass)
      const { id } = created.body as Slot

      const foreignUnit = await createUnit(context.db, {
        organizationId: (await createOrganization(context.db)).id,
      })
      const foreignTimetable = await context.db.timetable.create({
        data: { unitId: foreignUnit.id, name: 'Manhã' },
      })

      const response = await as(admin, server().delete(`${slots(foreignTimetable.id)}/${id}`))

      expect(response.status).toBe(404)
      expect(await context.db.timeSlot.count({ where: { id } })).toBe(1)
    })
  })

  // Turma montada sobre a grade: é a FK do Board que barra a exclusão dela.
  async function putTimetableInABoard() {
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

    return db.board.create({
      data: { unitId, projectId: project.id, timetableId, name: 'TADS 1', level: 1 },
    })
  }

  // E a célula do quadro sobre a faixa: é ela que congela o horário.
  async function putSlotInABoard() {
    const created = await createSlot(admin, firstClass)
    const { id } = created.body as Slot
    const board = await putTimetableInABoard()

    await context.db.boardSlot.create({
      data: { unitId, boardId: board.id, timeSlotId: id, weekDay: 1 },
    })

    return id
  }
})
