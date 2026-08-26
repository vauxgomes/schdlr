import { MemberRole } from '@prisma/client'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'

import { AuditEntry } from '../../src/infra/audit/audit-entry'
import { AUDIT_SINKS, AuditSink } from '../../src/infra/audit/sinks/audit-sink'
import { FileAuditSink } from '../../src/infra/audit/sinks/file-audit.sink'
import { createTestApp, TestContext } from '../support/app'
import { registerAndLogin, TestSession } from '../support/auth'
import { truncateAll } from '../support/database'

// O registro é fire-and-forget e resolve o nome do ator no banco, então um
// tick não basta: espera-se a condição, não o relógio.
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs

  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

// Sink de teste registrado ao lado do de arquivo: é a prova de que acrescentar
// destino não exige tocar em nenhum service.
class CollectingSink implements AuditSink {
  readonly entries: AuditEntry[] = []

  write(entry: AuditEntry) {
    this.entries.push(entry)
  }
}

describe('Audit trail (e2e)', () => {
  let context: TestContext
  let collected: CollectingSink
  let directory: string
  let admin: TestSession
  let teacher: TestSession
  let organizationId: string
  let unitId: string

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const actions = () => collected.entries.map((entry) => entry.action)

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'schdlr-audit-'))
    collected = new CollectingSink()

    context = await createTestApp([], (builder) =>
      builder.overrideProvider(AUDIT_SINKS).useValue([new FileAuditSink(directory), collected]),
    )
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    collected.entries.length = 0

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

  it('records who did it, from the token and not from the body', async () => {
    await waitFor(() => collected.entries.some((entry) => entry.action === 'unit.created'))

    const created = collected.entries.find((entry) => entry.action === 'unit.created')

    // `unit` vem nulo de propósito: criar unidade acontece sob a organização,
    // numa rota sem :unitId, então não há contexto de unidade para registrar.
    // Quem procura a história da unidade acha por `subject=unit:<id>`.
    expect(created).toMatchObject({
      outcome: 'ok',
      actorId: admin.userId,
      unitId: null,
      subjectType: 'unit',
      subjectId: unitId,
    })
    expect(created?.actorName).toBe(`User ${admin.email.match(/user(\d+)-/)?.[1]}`)
  })

  // A rede da spec: mutação sem registro quebra aqui, não em produção.
  it('leaves exactly one entry per mutation', async () => {
    collected.entries.length = 0

    const member = await context.db.unitMember.findFirstOrThrow({
      where: { unitId, userId: teacher.userId },
    })

    await as(admin, server().patch(`/units/${unitId}`)).send({ name: 'Campus Natal Central' })
    await as(admin, server().patch(`/units/${unitId}/members/${member.id}/roles`)).send({
      roles: [MemberRole.COORDINATOR],
    })
    await as(admin, server().patch(`/units/${unitId}/members/${member.id}/status`)).send({
      isActive: false,
    })
    await as(admin, server().post(`/units/${unitId}/invites`)).send({
      email: 'newcomer@schdlr.test',
      roles: [MemberRole.TEACHER],
    })

    const course = await as(admin, server().post(`/units/${unitId}/courses`)).send({
      name: 'Systems Analysis',
      code: 'TADS',
    })
    const courseId = (course.body as { id: string }).id

    await as(admin, server().patch(`/units/${unitId}/courses/${courseId}`)).send({ name: 'TADS' })
    await as(admin, server().delete(`/units/${unitId}/courses/${courseId}`))

    const discipline = await as(admin, server().post(`/units/${unitId}/disciplines`)).send({
      name: 'Object Oriented Programming',
      code: 'POO',
      workload: 80,
    })
    const disciplineId = (discipline.body as { id: string }).id

    await as(admin, server().patch(`/units/${unitId}/disciplines/${disciplineId}`)).send({
      workload: 120,
    })
    await as(admin, server().delete(`/units/${unitId}/disciplines/${disciplineId}`))
    await waitFor(() => collected.entries.length >= 10)

    expect(actions()).toEqual([
      'unit.updated',
      'member.roles-changed',
      'member.deactivated',
      'invite.created',
      'course.created',
      'course.updated',
      'course.deleted',
      'discipline.created',
      'discipline.updated',
      'discipline.deleted',
    ])
  })

  it('records a denial once, with the route as subject', async () => {
    collected.entries.length = 0

    const response = await as(teacher, server().patch(`/units/${unitId}`)).send({ name: 'Nope' })
    await waitFor(() => collected.entries.length > 0)

    expect(response.status).toBe(403)
    expect(collected.entries).toHaveLength(1)
    expect(collected.entries[0]).toMatchObject({
      outcome: 'denied',
      action: 'access.denied',
      subjectType: 'route',
      actorId: teacher.userId,
      data: { assert: 'assertManagement' },
    })
  })

  it('records nothing when the assert passes', async () => {
    collected.entries.length = 0

    await as(teacher, server().get(`/units/${unitId}`))
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(collected.entries).toEqual([])
  })

  it('writes the line to the file of the day', async () => {
    await waitFor(() => collected.entries.length > 0)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const day = new Date().toISOString().slice(0, 10)
    const content = readFileSync(join(directory, `audit-${day}.log`), 'utf-8')

    expect(content).toMatch(/audit\/1 outcome=ok actor=\S+ actor\.name="[^"]*"/)
    expect(content).toContain('action=unit.created')
  })
})
