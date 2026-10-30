import { INestApplication } from '@nestjs/common'
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
    await http().get('/api/profile').expect(401)
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
    expect(res.body).toMatchObject({ message: 'Validation failed', errors: [{ path: 'name' }] })
    expect(profile.update).not.toHaveBeenCalled()
  })
})
