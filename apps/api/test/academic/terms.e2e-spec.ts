import { MemberRole, TermStatus } from '@prisma/client'
import request from 'supertest'

import { createTestApp, TestContext } from '../support/app'
import { registerAndLogin, TestSession } from '../support/auth'
import { truncateAll } from '../support/database'
import { createOrganization, createUnit } from '../support/factories'

type Term = { id: string; name: string; status: TermStatus; startDate: string; endDate: string }

describe('Terms (e2e)', () => {
  let context: TestContext
  let admin: TestSession
  let teacher: TestSession
  let unitId: string

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const createTerm = (session: TestSession, body: Record<string, unknown>) =>
    as(session, server().post(`/units/${unitId}/terms`)).send(body)

  const setStatus = (session: TestSession, termId: string, status: TermStatus) =>
    as(session, server().patch(`/units/${unitId}/terms/${termId}/status`)).send({ status })

  const valid = { name: '2026.1', startDate: '2026-02-01', endDate: '2026-07-01' }

  // Leva o período até o estado pedido, passo a passo: não há atalho, e é
  // justamente isso que a máquina de estado garante.
  const walkTo = async (termId: string, target: TermStatus) => {
    const path = [TermStatus.ADJUSTMENTS, TermStatus.STARTED, TermStatus.FINISHED]

    for (const status of path) {
      await setStatus(admin, termId, status)

      if (status === target) return
    }
  }

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
    it('creates a term in PLANNING', async () => {
      const response = await createTerm(admin, valid)

      expect(response.status).toBe(201)
      expect(response.body as Term).toMatchObject({ name: '2026.1', status: TermStatus.PLANNING })
    })

    it('answers 400 when endDate comes before startDate', async () => {
      const response = await createTerm(admin, { ...valid, endDate: '2026-01-01' })

      expect(response.status).toBe(400)
    })

    it('answers 400 when endDate equals startDate', async () => {
      const response = await createTerm(admin, { ...valid, endDate: valid.startDate })

      expect(response.status).toBe(400)
    })

    it('answers 409 for a name already taken in the unit', async () => {
      await createTerm(admin, valid)

      const response = await createTerm(admin, { ...valid, startDate: '2026-03-01' })

      expect(response.status).toBe(409)
    })

    // Regular e intensivo convivem: sobreposição de datas é o caso normal.
    it('accepts two terms overlapping in time', async () => {
      await createTerm(admin, valid)

      const response = await createTerm(admin, {
        name: '2026.1 intensivo',
        startDate: '2026-03-01',
        endDate: '2026-04-15',
      })

      expect(response.status).toBe(201)
      expect(await context.db.term.count({ where: { unitId } })).toBe(2)
    })

    it('refuses a TEACHER', async () => {
      const response = await createTerm(teacher, valid)

      expect(response.status).toBe(403)
    })
  })

  describe('the status machine', () => {
    let termId: string

    beforeEach(async () => {
      const created = await createTerm(admin, valid)
      termId = (created.body as Term).id
    })

    it('walks PLANNING to FINISHED, one step at a time', async () => {
      expect((await setStatus(admin, termId, TermStatus.ADJUSTMENTS)).status).toBe(200)
      expect((await setStatus(admin, termId, TermStatus.STARTED)).status).toBe(200)

      const finished = await setStatus(admin, termId, TermStatus.FINISHED)

      expect(finished.status).toBe(200)
      expect((finished.body as Term).status).toBe(TermStatus.FINISHED)
    })

    it('answers 409 for a step that does not exist', async () => {
      const response = await setStatus(admin, termId, TermStatus.STARTED)

      expect(response.status).toBe(409)
      expect((await context.db.term.findUniqueOrThrow({ where: { id: termId } })).status).toBe(
        TermStatus.PLANNING,
      )
    })

    it('answers 409 for FINISHED going back to PLANNING', async () => {
      await walkTo(termId, TermStatus.FINISHED)

      const response = await setStatus(admin, termId, TermStatus.PLANNING)

      expect(response.status).toBe(409)
    })

    it('cancels a term that has not finished', async () => {
      await walkTo(termId, TermStatus.STARTED)

      const response = await setStatus(admin, termId, TermStatus.CANCELLED)

      expect(response.status).toBe(200)
    })

    it('answers 409 for cancelling a finished term', async () => {
      await walkTo(termId, TermStatus.FINISHED)

      const response = await setStatus(admin, termId, TermStatus.CANCELLED)

      expect(response.status).toBe(409)
    })

    it('answers 400 for a status outside the enum', async () => {
      const response = await as(
        admin,
        server().patch(`/units/${unitId}/terms/${termId}/status`),
      ).send({ status: 'PAUSED' })

      expect(response.status).toBe(400)
    })

    it('refuses a TEACHER', async () => {
      const response = await setStatus(teacher, termId, TermStatus.ADJUSTMENTS)

      expect(response.status).toBe(403)
    })
  })

  describe('updating', () => {
    let termId: string

    beforeEach(async () => {
      const created = await createTerm(admin, valid)
      termId = (created.body as Term).id
    })

    // O `status` no corpo do PATCH genérico é campo desconhecido: o Zod o
    // descarta, e a transição continua sendo assunto do endpoint próprio.
    it('ignores status in the generic update', async () => {
      const response = await as(admin, server().patch(`/units/${unitId}/terms/${termId}`)).send({
        name: '2026.1 ajustado',
        status: TermStatus.STARTED,
      })

      expect(response.status).toBe(200)
      expect(response.body as Term).toMatchObject({
        name: '2026.1 ajustado',
        status: TermStatus.PLANNING,
      })
    })

    it('answers 400 when the patch would put endDate before startDate', async () => {
      const response = await as(admin, server().patch(`/units/${unitId}/terms/${termId}`)).send({
        endDate: '2026-01-01',
      })

      expect(response.status).toBe(400)
    })

    it('refuses a TEACHER', async () => {
      const response = await as(teacher, server().patch(`/units/${unitId}/terms/${termId}`)).send({
        name: 'Nope',
      })

      expect(response.status).toBe(403)
    })
  })

  describe('reading and deleting', () => {
    let termId: string

    beforeEach(async () => {
      const created = await createTerm(admin, valid)
      termId = (created.body as Term).id
    })

    it('returns id, name and status in select', async () => {
      const response = await as(teacher, server().get(`/units/${unitId}/terms/select`))
      const body = response.body as Term[]

      expect(response.status).toBe(200)
      expect(Object.keys(body[0]).sort()).toEqual(['id', 'name', 'status'])
    })

    it('paginates the listing, newest first', async () => {
      await createTerm(admin, { name: '2026.2', startDate: '2026-08-01', endDate: '2026-12-01' })

      const response = await as(admin, server().get(`/units/${unitId}/terms?limit=1`))
      const body = response.body as { items: Term[]; total: number }

      expect(body.total).toBe(2)
      expect(body.items.map((term) => term.name)).toEqual(['2026.2'])
    })

    it('deletes a term with no project', async () => {
      const response = await as(admin, server().delete(`/units/${unitId}/terms/${termId}`))

      expect(response.status).toBe(204)
    })

    it('answers 409 for a term that already has a project', async () => {
      const member = await context.db.unitMember.findFirstOrThrow({
        where: { unitId, userId: admin.userId },
      })
      const course = await context.db.course.create({
        data: { unitId, name: 'Systems Analysis', code: 'TADS' },
      })
      const curriculum = await context.db.curriculum.create({
        data: { unitId, courseId: course.id, name: '2026.1' },
      })

      await context.db.project.create({
        data: {
          unitId,
          termId,
          curriculumId: curriculum.id,
          createdById: member.id,
          name: 'TADS 2026.1',
        },
      })

      const response = await as(admin, server().delete(`/units/${unitId}/terms/${termId}`))

      expect(response.status).toBe(409)
    })
  })

  describe('tenant isolation', () => {
    let foreignTermId: string

    beforeEach(async () => {
      const organization = await createOrganization(context.db)
      const foreignUnit = await createUnit(context.db, { organizationId: organization.id })

      foreignTermId = (
        await context.db.term.create({
          data: {
            unitId: foreignUnit.id,
            name: 'Foreign',
            startDate: new Date('2026-02-01'),
            endDate: new Date('2026-07-01'),
          },
        })
      ).id
    })

    it('does not read a term from another unit', async () => {
      const response = await as(admin, server().get(`/units/${unitId}/terms/${foreignTermId}`))

      expect(response.status).toBe(404)
    })

    it('does not move the status of a term from another unit', async () => {
      const response = await setStatus(admin, foreignTermId, TermStatus.ADJUSTMENTS)

      expect(response.status).toBe(404)
      expect(
        (await context.db.term.findUniqueOrThrow({ where: { id: foreignTermId } })).status,
      ).toBe(TermStatus.PLANNING)
    })

    it('does not delete a term from another unit', async () => {
      const response = await as(admin, server().delete(`/units/${unitId}/terms/${foreignTermId}`))

      expect(response.status).toBe(404)
      expect(await context.db.term.count({ where: { id: foreignTermId } })).toBe(1)
    })
  })
})
