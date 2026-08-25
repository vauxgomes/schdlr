import { MemberRole, NotificationType } from '@prisma/client'
import request from 'supertest'
import { NotificationsService } from '../src/modules/notifications/notifications.service'
import { createTestApp, TestContext } from './support/app'
import { registerAndLogin, TestSession } from './support/auth'
import { truncateAll } from './support/database'

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('Notifications (e2e)', () => {
  let context: TestContext
  let owner: TestSession
  let stranger: TestSession

  const server = () => request(context.app.getHttpServer())

  const as = (session: TestSession, req: request.Test) =>
    req.set('Authorization', `Bearer ${session.accessToken}`)

  const notify = (session: TestSession, unitName = 'Campus Natal') =>
    context.app.get(NotificationsService).create({
      userId: session.userId,
      type: NotificationType.MEMBER_ACTIVATED,
      payload: { unitId: 'unit-1', unitName },
    })

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    owner = await registerAndLogin(context)
    stranger = await registerAndLogin(context)
  })

  afterAll(async () => {
    await context.app.close()
  })

  describe('creating', () => {
    it('rejects a payload that does not match the type', async () => {
      const service = context.app.get(NotificationsService)

      await expect(
        service.create({
          userId: owner.userId,
          type: NotificationType.MEMBER_ACTIVATED,
          payload: { unitId: 'unit-1' } as never,
        }),
      ).rejects.toMatchObject({ status: 400 })

      expect(await context.db.notification.count()).toBe(0)
    })
  })

  describe('listing', () => {
    it('never returns a notification from another user', async () => {
      await notify(owner)
      await notify(stranger, 'Campus Zona Norte')

      const response = await as(owner, server().get('/notifications'))
      const body = response.body as { items: { userId: string }[]; total: number }

      expect(body.total).toBe(1)
      expect(body.items.every((item) => item.userId === owner.userId)).toBe(true)
    })

    it('paginates', async () => {
      await notify(owner)
      await notify(owner)
      await notify(owner)

      const response = await as(owner, server().get('/notifications?page=2&limit=2'))
      const body = response.body as { items: unknown[]; total: number; page: number }

      expect(body.total).toBe(3)
      expect(body.page).toBe(2)
      expect(body.items).toHaveLength(1)
    })

    it('filters the unread ones when asked', async () => {
      const read = await notify(owner)
      await notify(owner)

      await as(owner, server().patch('/notifications/read')).send({ ids: [read.id] })

      const response = await as(owner, server().get('/notifications?unreadOnly=true'))

      expect((response.body as { total: number }).total).toBe(1)
    })

    it('rejects a limit beyond the ceiling', async () => {
      const response = await as(owner, server().get('/notifications?limit=500'))

      expect(response.status).toBe(400)
    })
  })

  describe('unread count', () => {
    it('agrees with the listing', async () => {
      const first = await notify(owner)
      await notify(owner)

      const before = await as(owner, server().get('/notifications/unread-count'))

      expect((before.body as { count: number }).count).toBe(2)

      await as(owner, server().patch('/notifications/read')).send({ ids: [first.id] })

      const after = await as(owner, server().get('/notifications/unread-count'))
      const unread = await as(owner, server().get('/notifications?unreadOnly=true'))

      expect((after.body as { count: number }).count).toBe(1)
      expect((unread.body as { total: number }).total).toBe(1)
    })
  })

  describe('marking as read', () => {
    it('is idempotent', async () => {
      const notification = await notify(owner)

      const first = await as(owner, server().patch('/notifications/read')).send({
        ids: [notification.id],
      })
      const second = await as(owner, server().patch('/notifications/read')).send({
        ids: [notification.id],
      })

      expect((first.body as { updated: number }).updated).toBe(1)
      expect((second.body as { updated: number }).updated).toBe(0)

      const stored = await context.db.notification.findUniqueOrThrow({
        where: { id: notification.id },
      })

      expect(stored.readAt).not.toBeNull()
    })

    it('has no effect on someone else’s notification', async () => {
      const theirs = await notify(stranger)

      const response = await as(owner, server().patch('/notifications/read')).send({
        ids: [theirs.id],
      })

      expect((response.body as { updated: number }).updated).toBe(0)

      const stored = await context.db.notification.findUniqueOrThrow({ where: { id: theirs.id } })

      expect(stored.readAt).toBeNull()
    })
  })

  // O elo que a 0009 deixou solto: o evento existia e ninguém escutava.
  describe('reacting to domain events', () => {
    it('stores a notification when a member is deactivated', async () => {
      const organization = await as(owner, server().post('/organizations')).send({ name: 'IFRN' })
      const { id: organizationId } = organization.body as { id: string }
      const unit = await as(owner, server().post(`/organizations/${organizationId}/units`)).send({
        name: 'Campus Natal',
      })
      const unitId = (unit.body as { id: string }).id

      const member = await context.db.unitMember.create({
        data: { unitId, userId: stranger.userId, roles: [MemberRole.TEACHER] },
      })

      await as(owner, server().patch(`/units/${unitId}/members/${member.id}/status`)).send({
        isActive: false,
      })
      await flush()

      const stored = await context.db.notification.findFirstOrThrow({
        where: { userId: stranger.userId },
      })

      expect(stored.type).toBe(NotificationType.MEMBER_DEACTIVATED)
      expect(stored.payload).toMatchObject({ unitId, unitName: 'Campus Natal' })
    })
  })
})
