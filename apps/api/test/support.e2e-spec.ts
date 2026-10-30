import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service'
import { UsersService } from '@modules/users/users.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('/api/support', () => {
  let app: INestApplication<App>
  let jwt: JwtService
  // O SystemRoleGuard lê o papel daqui.
  const database = { user: { findUnique: jest.fn() } }
  const subscriptions = { findByEmail: jest.fn(), assign: jest.fn(), extend: jest.fn() }
  const users = { setSystemRole: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(SubscriptionsService)
      .useValue(subscriptions)
      .overrideProvider(UsersService)
      .useValue(users)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    jwt = moduleRef.get(JwtService)
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const as = (systemRole: string) => {
    database.user.findUnique.mockResolvedValue({ systemRole, isActive: true })
    return `Bearer ${jwt.sign({ sub: 'caller-1' })}`
  }
  const http = () => request(app.getHttpServer())
  const S = '/api/support/subscriptions'

  it('sem token dá 401', async () => {
    await http()
      .get(`${S}/teacher@schdlr.dev`)
      .expect(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' })
  })

  it('USER dá 403', async () => {
    await http()
      .get(`${S}/teacher@schdlr.dev`)
      .set('Authorization', as('USER'))
      .expect(403, { statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' })
    expect(subscriptions.findByEmail).not.toHaveBeenCalled()
  })

  it.each(['SUPPORT', 'MASTER'])('%s consulta, com o e-mail normalizado', async (role) => {
    subscriptions.findByEmail.mockResolvedValue({ plan: 'GRACE' })
    await http()
      .get(`${S}/Teacher@SCHDLR.dev`)
      .set('Authorization', as(role))
      .expect(200, { plan: 'GRACE' })
    expect(subscriptions.findByEmail).toHaveBeenCalledWith('teacher@schdlr.dev')
  })

  it('PUT passa plano e quem atribuiu', async () => {
    subscriptions.assign.mockResolvedValue({ plan: 'TRIAL' })
    await http()
      .put(`${S}/teacher@schdlr.dev`)
      .set('Authorization', as('SUPPORT'))
      .send({ plan: 'TRIAL' })
      .expect(200)
    expect(subscriptions.assign).toHaveBeenCalledWith(
      'teacher@schdlr.dev',
      { plan: 'TRIAL' },
      'caller-1',
    )
  })

  it('PUT com PRO dá 400', async () => {
    const res = await http()
      .put(`${S}/teacher@schdlr.dev`)
      .set('Authorization', as('SUPPORT'))
      .send({ plan: 'PRO' })
      .expect(400)
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'plan', code: 'invalid_value', params: { values: ['GRACE', 'TRIAL'] } }],
    })
  })

  it('PUT GRACE com expiresAt dá 400 GRACE_DOES_NOT_EXPIRE', async () => {
    const res = await http()
      .put(`${S}/teacher@schdlr.dev`)
      .set('Authorization', as('SUPPORT'))
      .send({ plan: 'GRACE', expiresAt: '2030-01-01T00:00:00Z' })
      .expect(400)
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'expiresAt', code: 'GRACE_DOES_NOT_EXPIRE' }],
    })
  })

  it('erro do service sai com o código do catálogo', async () => {
    subscriptions.findByEmail.mockRejectedValue(new AppException('SUBSCRIPTION_NOT_FOUND'))
    await http().get(`${S}/teacher@schdlr.dev`).set('Authorization', as('SUPPORT')).expect(404, {
      statusCode: 404,
      code: 'SUBSCRIPTION_NOT_FOUND',
      message: 'Subscription not found',
    })
  })

  it('extend responde 200', async () => {
    subscriptions.extend.mockResolvedValue({ plan: 'TRIAL' })
    await http()
      .post(`${S}/teacher@schdlr.dev/extend`)
      .set('Authorization', as('SUPPORT'))
      .expect(200)
    expect(subscriptions.extend).toHaveBeenCalledWith('teacher@schdlr.dev', 'caller-1')
  })

  describe('system-role', () => {
    const R = '/api/support/users/teacher@schdlr.dev/system-role'

    it('SUPPORT dá 403', async () => {
      await http()
        .put(R)
        .set('Authorization', as('SUPPORT'))
        .send({ systemRole: 'SUPPORT' })
        .expect(403, { statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' })
      expect(users.setSystemRole).not.toHaveBeenCalled()
    })

    it('MASTER promove', async () => {
      users.setSystemRole.mockResolvedValue({ systemRole: 'SUPPORT' })
      await http()
        .put(R)
        .set('Authorization', as('MASTER'))
        .send({ systemRole: 'SUPPORT' })
        .expect(200)
      expect(users.setSystemRole).toHaveBeenCalledWith('teacher@schdlr.dev', {
        systemRole: 'SUPPORT',
      })
    })

    it('MASTER no corpo dá 400', async () => {
      await http()
        .put(R)
        .set('Authorization', as('MASTER'))
        .send({ systemRole: 'MASTER' })
        .expect(400)
    })
  })
})
