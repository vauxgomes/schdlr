import { INestApplication, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { DatabaseService } from '@infra/database/database.service'
import { ProfileService } from '@modules/profile/profile.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('/api/profile', () => {
  let app: INestApplication<App>
  let token: string
  const profile = { get: jest.fn(), update: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(ProfileService)
      .useValue(profile)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())

  it('sem token dá 401', async () => {
    await http()
      .get('/api/profile')
      .expect(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' })
    await http().patch('/api/profile').send({ name: 'X' }).expect(401)
  })

  it('GET devolve o perfil do usuário do token', async () => {
    profile.get.mockResolvedValue({ id: 'user-1', organizationsOwned: 0, subscription: null })
    await http()
      .get('/api/profile')
      .set('Authorization', token)
      .expect(200, { id: 'user-1', organizationsOwned: 0, subscription: null })
    expect(profile.get).toHaveBeenCalledWith('user-1')
  })

  it('PATCH aplica trim e ignora email e systemRole', async () => {
    profile.update.mockResolvedValue({ name: 'Ana' })
    await http()
      .patch('/api/profile')
      .set('Authorization', token)
      .send({ name: '  Ana  ', email: 'outro@x.dev', systemRole: 'MASTER' })
      .expect(200, { name: 'Ana' })
    expect(profile.update).toHaveBeenCalledWith('user-1', { name: 'Ana' })
  })

  it.each([[''], ['   '], ['x'.repeat(121)]])('PATCH com nome inválido dá 400', async (name) => {
    const res = await http()
      .patch('/api/profile')
      .set('Authorization', token)
      .send({ name })
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ path: 'name' }] })
    expect(profile.update).not.toHaveBeenCalled()
  })

  it('nome longo dá too_big com o máximo nos params', async () => {
    const res = await http()
      .patch('/api/profile')
      .set('Authorization', token)
      .send({ name: 'x'.repeat(121) })
      .expect(400)
    expect(res.body).toMatchObject({
      errors: [
        {
          path: 'name',
          code: 'too_big',
          params: { origin: 'string', maximum: 120, inclusive: true },
        },
      ],
    })
  })

  // O que só o AppExceptionFilter trata: exceções do Nest e do body-parser, e erro qualquer.
  describe('corpo de erro', () => {
    it('rota inexistente dá 404 NOT_FOUND', async () => {
      await http()
        .get('/api/nao-existe')
        .set('Authorization', token)
        .expect(404, { statusCode: 404, code: 'NOT_FOUND', message: 'Not found' })
    })

    it('JSON inválido dá 400 BAD_REQUEST', async () => {
      await http()
        .patch('/api/profile')
        .set('Authorization', token)
        .set('content-type', 'application/json')
        .send('{bad json')
        .expect(400, { statusCode: 400, code: 'BAD_REQUEST', message: 'Bad request' })
    })

    it('erro não tratado dá 500 sem detalhe', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation()
      profile.get.mockRejectedValue(new Error('segredo do banco'))
      await http().get('/api/profile').set('Authorization', token).expect(500, {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      })
      expect(logged).toHaveBeenCalledWith('segredo do banco', expect.any(String))
      logged.mockRestore()
    })
  })
})
