import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { OrganizationsService } from '@modules/organizations/organizations.service'
import { UnitsService } from '@modules/organizations/units.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('/api/organizations', () => {
  let app: INestApplication<App>
  let token: string
  const organizations = { create: jest.fn(), list: jest.fn(), get: jest.fn(), update: jest.fn() }
  const units = { create: jest.fn(), list: jest.fn(), get: jest.fn(), update: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(OrganizationsService)
      .useValue(organizations)
      .overrideProvider(UnitsService)
      .useValue(units)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const O = '/api/organizations'

  it('sem token dá 401', async () => {
    await http().get(O).expect(401)
    await http().get(`${O}/acme/units/sede`).expect(401)
  })

  it('POST normaliza o corpo e responde 201', async () => {
    organizations.create.mockResolvedValue({ slug: 'acme' })
    await http()
      .post(O)
      .set('Authorization', token)
      .send({ name: ' Acme ', slug: ' ACME ', address: '' })
      .expect(201, { slug: 'acme' })
    expect(organizations.create).toHaveBeenCalledWith('user-1', {
      name: 'Acme',
      slug: 'acme',
      address: null,
    })
  })

  it('slug fora do formato no corpo dá 400', async () => {
    const res = await http()
      .post(`${O}/acme/units`)
      .set('Authorization', token)
      .send({ name: 'Sede', slug: 'não é slug' })
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ path: 'slug' }] })
    expect(units.create).not.toHaveBeenCalled()
  })

  it('erro de regra sai com código e params', async () => {
    organizations.create.mockRejectedValue(
      new AppException('PLAN_LIMIT_REACHED', { limit: 'organizations', max: 1 }),
    )
    await http()
      .post(O)
      .set('Authorization', token)
      .send({ name: 'Acme', slug: 'acme' })
      .expect(403, {
        statusCode: 403,
        code: 'PLAN_LIMIT_REACHED',
        message: 'Plan limit reached',
        params: { limit: 'organizations', max: 1 },
      })
  })

  it('PATCH ignora slug; sem campo válido dá EMPTY_UPDATE', async () => {
    organizations.update.mockResolvedValue({ slug: 'acme' })
    await http()
      .patch(`${O}/acme`)
      .set('Authorization', token)
      .send({ name: 'Nova', slug: 'outro' })
      .expect(200)
    expect(organizations.update).toHaveBeenCalledWith('user-1', 'acme', { name: 'Nova' })

    const res = await http()
      .patch(`${O}/acme`)
      .set('Authorization', token)
      .send({ slug: 'outro' })
      .expect(400)
    expect(res.body).toMatchObject({ errors: [{ path: '', code: 'EMPTY_UPDATE' }] })
  })

  it('rotas de unidade repassam os dois slugs', async () => {
    units.list.mockResolvedValue([])
    units.get.mockResolvedValue({ slug: 'sede' })
    units.update.mockResolvedValue({ slug: 'sede' })

    await http().get(`${O}/acme/units`).set('Authorization', token).expect(200, [])
    await http().get(`${O}/acme/units/sede`).set('Authorization', token).expect(200)
    await http()
      .patch(`${O}/acme/units/sede`)
      .set('Authorization', token)
      .send({ isActive: false })
      .expect(200)

    expect(units.list).toHaveBeenCalledWith('user-1', 'acme')
    expect(units.get).toHaveBeenCalledWith('user-1', 'acme', 'sede')
    expect(units.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', { isActive: false })
  })

  it('GET lista e uma organização', async () => {
    organizations.list.mockResolvedValue([{ slug: 'acme' }])
    organizations.get.mockRejectedValue(new AppException('ORGANIZATION_NOT_FOUND'))
    await http()
      .get(O)
      .set('Authorization', token)
      .expect(200, [{ slug: 'acme' }])
    await http().get(`${O}/acme`).set('Authorization', token).expect(404, {
      statusCode: 404,
      code: 'ORGANIZATION_NOT_FOUND',
      message: 'Organization not found',
    })
  })
})

// Com os services reais e o banco substituído: o 404 de slug inválido no caminho.
describe('/api/organizations — slug no caminho', () => {
  let app: INestApplication<App>
  let token: string
  const database = { organization: { findUnique: jest.fn() } }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())

  it('slug fora do formato dá 404, sem consultar o banco', async () => {
    await http(app)
      .get('/api/organizations/n%C3%A3o_slug')
      .set('Authorization', token)
      .expect(404)
      .expect((res) => expect(res.body).toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' }))
    expect(database.organization.findUnique).not.toHaveBeenCalled()
  })
})

const http = (app: INestApplication<App>) => request(app.getHttpServer())
