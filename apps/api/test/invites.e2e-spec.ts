import { InviteStatus, MemberRole, NotificationType } from '@prisma/client'
import request from 'supertest'
import { MailService } from '../src/infra/mail/mail.service'
import { createTestApp, TestContext } from './support/app'
import { registerAndLogin, TestSession } from './support/auth'
import { truncateAll } from './support/database'

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('Unit invites (e2e)', () => {
  let context: TestContext
  let admin: TestSession
  let invited: TestSession
  let unitId: string
  let send: jest.SpyInstance

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const invite = (email: string, roles: MemberRole[] = [MemberRole.TEACHER]) =>
    as(admin, server().post(`/units/${unitId}/invites`)).send({ email, roles })

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    send = jest.spyOn(context.app.get(MailService), 'send').mockResolvedValue(undefined)

    admin = await registerAndLogin(context)
    invited = await registerAndLogin(context)

    const organization = await as(admin, server().post('/organizations')).send({ name: 'IFRN' })
    const { id: organizationId } = organization.body as { id: string }
    const unit = await as(admin, server().post(`/organizations/${organizationId}/units`)).send({
      name: 'Campus Natal',
    })
    unitId = (unit.body as { id: string }).id
    send.mockClear()
  })

  afterEach(() => send.mockRestore())

  afterAll(async () => {
    await context.app.close()
  })

  describe('two delivery paths', () => {
    it('notifies in-app when the e-mail already has an account, without sending mail', async () => {
      const response = await invite(invited.email)
      await flush()

      expect(response.status).toBe(201)
      expect(send).not.toHaveBeenCalled()

      const notification = await context.db.notification.findFirstOrThrow({
        where: { userId: invited.userId },
      })

      expect(notification.type).toBe(NotificationType.UNIT_INVITE)
      expect(notification.payload).toMatchObject({ unitId, unitName: 'Campus Natal' })
    })

    it('sends mail when the e-mail has no account, and stores no notification', async () => {
      await invite('newcomer@schdlr.test')
      await flush()

      expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'newcomer@schdlr.test' }))
      expect(await context.db.notification.count()).toBe(0)
    })
  })

  describe('creating', () => {
    it('answers 409 for someone already an active member', async () => {
      await invite(invited.email)
      const stored = await context.db.unitInvite.findFirstOrThrow()
      await as(invited, server().post(`/invites/${stored.token}/accept`))

      const again = await invite(invited.email)

      expect(again.status).toBe(409)
    })

    it('requires management', async () => {
      const response = await as(invited, server().post(`/units/${unitId}/invites`)).send({
        email: 'x@schdlr.test',
        roles: [MemberRole.TEACHER],
      })

      expect(response.status).toBe(403)
    })
  })

  describe('accepting', () => {
    it('creates the member with exactly the invited roles', async () => {
      await invite(invited.email, [MemberRole.COORDINATOR, MemberRole.TEACHER])
      const stored = await context.db.unitInvite.findFirstOrThrow()

      const response = await as(invited, server().post(`/invites/${stored.token}/accept`))

      expect(response.status).toBe(201)

      const member = await context.db.unitMember.findUniqueOrThrow({
        where: { userId_unitId: { userId: invited.userId, unitId } },
      })

      expect(member.roles).toEqual([MemberRole.COORDINATOR, MemberRole.TEACHER])
      expect(member.isActive).toBe(true)
    })

    it('refuses an expired invite and creates nothing', async () => {
      await invite(invited.email)
      const stored = await context.db.unitInvite.findFirstOrThrow()

      await context.db.unitInvite.update({
        where: { id: stored.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      })

      const response = await as(invited, server().post(`/invites/${stored.token}/accept`))

      expect(response.status).toBe(400)
      expect(await context.db.unitMember.count({ where: { userId: invited.userId } })).toBe(0)
    })

    it('refuses a revoked invite', async () => {
      await invite(invited.email)
      const stored = await context.db.unitInvite.findFirstOrThrow()

      await as(admin, server().post(`/units/${unitId}/invites/${stored.id}/revoke`))

      const response = await as(invited, server().post(`/invites/${stored.token}/accept`))

      expect(response.status).toBe(400)
    })

    it('refuses someone the invite was not addressed to', async () => {
      await invite('somebody-else@schdlr.test')
      const stored = await context.db.unitInvite.findFirstOrThrow()

      const response = await as(invited, server().post(`/invites/${stored.token}/accept`))

      expect(response.status).toBe(403)
    })

    // A decisão da spec: reconvite de ex-membro reativa, não duplica.
    it('reactivates a former member instead of duplicating the row', async () => {
      const member = await context.db.unitMember.create({
        data: { unitId, userId: invited.userId, roles: [MemberRole.TEACHER], isActive: false },
      })

      await invite(invited.email, [MemberRole.MANAGER])
      const stored = await context.db.unitInvite.findFirstOrThrow()
      await as(invited, server().post(`/invites/${stored.token}/accept`))

      const rows = await context.db.unitMember.findMany({ where: { userId: invited.userId } })

      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(member.id)
      expect(rows[0].isActive).toBe(true)
      expect(rows[0].roles).toEqual([MemberRole.MANAGER])
    })
  })

  describe('rejecting, revoking and resending', () => {
    it('marks the invite rejected without creating a member', async () => {
      await invite(invited.email)
      const stored = await context.db.unitInvite.findFirstOrThrow()

      const response = await as(invited, server().post(`/invites/${stored.token}/reject`))

      expect(response.status).toBe(204)
      expect(await context.db.unitMember.count({ where: { userId: invited.userId } })).toBe(0)

      const after = await context.db.unitInvite.findUniqueOrThrow({ where: { id: stored.id } })

      expect(after.status).toBe(InviteStatus.REJECTED)
    })

    it('answers 409 when revoking an invite that is already resolved', async () => {
      await invite(invited.email)
      const stored = await context.db.unitInvite.findFirstOrThrow()

      await as(admin, server().post(`/units/${unitId}/invites/${stored.id}/revoke`))
      const again = await as(admin, server().post(`/units/${unitId}/invites/${stored.id}/revoke`))

      expect(again.status).toBe(409)
    })

    it('rotates the token on resend, retiring the old one', async () => {
      await invite('newcomer@schdlr.test')
      const before = await context.db.unitInvite.findFirstOrThrow()

      await as(admin, server().post(`/units/${unitId}/invites/${before.id}/resend`))

      const after = await context.db.unitInvite.findUniqueOrThrow({ where: { id: before.id } })

      expect(after.token).not.toBe(before.token)
      expect(after.resentAt).not.toBeNull()
      expect(after.expiresAt.getTime()).toBeGreaterThanOrEqual(before.expiresAt.getTime())
    })

    it('filters the listing by status', async () => {
      await invite(invited.email)
      const stored = await context.db.unitInvite.findFirstOrThrow()
      await as(admin, server().post(`/units/${unitId}/invites/${stored.id}/revoke`))
      await invite('another@schdlr.test')

      const pending = await as(admin, server().get(`/units/${unitId}/invites?status=PENDING`))

      expect((pending.body as unknown[]).length).toBe(1)
    })
  })
})
