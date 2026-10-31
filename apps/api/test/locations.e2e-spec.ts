import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { LocationsService } from '@modules/locations/locations.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('locais', () => {
  let app: INestApplication<App>
  let token: string
  const locations = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(LocationsService)
      .useValue(locations)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const L = '/api/organizations/acme/units/sede/locations'

  it('sem token dá 401', async () => {
    await http().get(L).expect(401)
    await http().delete(`${L}/l-1`).expect(401)
  })

  it('POST normaliza o corpo e responde 201', async () => {
    locations.create.mockResolvedValue({ id: 'l-1' })
    await http()
      .post(L)
      .set('Authorization', token)
      .send({ name: ' Meet A ', type: 'VIRTUAL' })
      .expect(201, { id: 'l-1' })
    expect(locations.create).toHaveBeenCalledWith('user-1', 'acme', 'sede', {
      name: 'Meet A',
      type: 'VIRTUAL',
      capacity: null,
    })
  })

  it('POST fora da regra dá 400', async () => {
    const res = await http()
      .post(L)
      .set('Authorization', token)
      .send({ name: 'X', type: 'GARAGE', capacity: 0 })
      .expect(400)
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [
        { path: 'type', code: 'invalid_value' },
        { path: 'capacity', code: 'too_small' },
      ],
    })
    expect(locations.create).not.toHaveBeenCalled()
  })

  it('GET lista, com ?type=; valor fora do enum dá 400', async () => {
    locations.list.mockResolvedValue([])
    await http().get(`${L}?type=VIRTUAL`).set('Authorization', token).expect(200, [])
    expect(locations.list).toHaveBeenCalledWith('user-1', 'acme', 'sede', { type: 'VIRTUAL' })
    await http().get(`${L}?type=GARAGE`).set('Authorization', token).expect(400)
  })

  it('GET lê um', async () => {
    locations.get.mockResolvedValue({ id: 'l-1' })
    await http().get(`${L}/l-1`).set('Authorization', token).expect(200, { id: 'l-1' })
    expect(locations.get).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'l-1')
  })

  it('PATCH repassa o corpo; sem campo válido dá EMPTY_UPDATE', async () => {
    locations.update.mockResolvedValue({ id: 'l-1' })
    await http()
      .patch(`${L}/l-1`)
      .set('Authorization', token)
      .send({ capacity: null, unitId: 'outra' })
      .expect(200)
    expect(locations.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'l-1', {
      capacity: null,
    })

    const res = await http().patch(`${L}/l-1`).set('Authorization', token).send({}).expect(400)
    expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
  })

  it('DELETE responde 204', async () => {
    await http().delete(`${L}/l-1`).set('Authorization', token).expect(204)
    expect(locations.remove).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'l-1')
  })

  it.each([
    ['LOCATION_NOT_FOUND', 404, 'Location not found'],
    ['LOCATION_INACTIVE', 409, 'Location is inactive'],
    ['LOCATION_NAME_IN_USE', 409, 'Location name already in use'],
    ['LOCATION_IN_USE', 409, 'Location is used by a board slot'],
  ] as const)('erro de regra %s sai com o código', async (code, statusCode, message) => {
    locations.remove.mockRejectedValue(new AppException(code))
    await http()
      .delete(`${L}/l-1`)
      .set('Authorization', token)
      .expect(statusCode, { statusCode, code, message })
  })
})
