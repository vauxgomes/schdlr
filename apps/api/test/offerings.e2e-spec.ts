import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { OfferingsService } from '@modules/offerings/offerings.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('ofertas', () => {
  let app: INestApplication<App>
  let token: string
  const offerings = {
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    generate: jest.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(OfferingsService)
      .useValue(offerings)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const O = '/api/organizations/acme/units/sede/projects/p-1/offerings'

  it('sem token dá 401', async () => {
    await http().get(O).expect(401)
    await http().post(`${O}/generate`).expect(401)
  })

  it('GET lista com ?teacherId= e ?withoutTeacher=true; withoutTeacher fora de booleano dá 400', async () => {
    offerings.list.mockResolvedValue([])
    await http()
      .get(`${O}?teacherId=u-2&withoutTeacher=true`)
      .set('Authorization', token)
      .expect(200, [])
    expect(offerings.list).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', {
      teacherId: 'u-2',
      withoutTeacher: true,
    })
    await http().get(`${O}?withoutTeacher=talvez`).set('Authorization', token).expect(400)
  })

  it('GET lê uma', async () => {
    offerings.get.mockResolvedValue({ id: 'o-1' })
    await http().get(`${O}/o-1`).set('Authorization', token).expect(200, { id: 'o-1' })
    expect(offerings.get).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', 'o-1')
  })

  it('PATCH só leva teacherId; null tira; sem teacherId dá EMPTY_UPDATE', async () => {
    offerings.update.mockResolvedValue({ id: 'o-1' })
    await http()
      .patch(`${O}/o-1`)
      .set('Authorization', token)
      .send({ teacherId: 'u-2', subjectId: 's-2' })
      .expect(200, { id: 'o-1' })
    expect(offerings.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', 'o-1', {
      teacherId: 'u-2',
    })
    await http().patch(`${O}/o-1`).set('Authorization', token).send({ teacherId: null }).expect(200)
    expect(offerings.update).toHaveBeenLastCalledWith('user-1', 'acme', 'sede', 'p-1', 'o-1', {
      teacherId: null,
    })
    const res = await http()
      .patch(`${O}/o-1`)
      .set('Authorization', token)
      .send({ subjectId: 's-2' })
      .expect(400)
    expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
  })

  it('PATCH com professor que não é da organização dá 400 INVALID_TEACHER', async () => {
    offerings.update.mockRejectedValue(new AppException('INVALID_TEACHER'))
    await http()
      .patch(`${O}/o-1`)
      .set('Authorization', token)
      .send({ teacherId: 'u-9' })
      .expect(400, {
        statusCode: 400,
        code: 'INVALID_TEACHER',
        message: 'Teacher must be a teacher of the organization',
      })
  })

  it('DELETE responde 204; oferta de outro projeto dá 404 OFFERING_NOT_FOUND', async () => {
    await http().delete(`${O}/o-1`).set('Authorization', token).expect(204)
    expect(offerings.remove).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', 'o-1')
    offerings.remove.mockRejectedValue(new AppException('OFFERING_NOT_FOUND'))
    await http()
      .delete(`${O}/o-2`)
      .set('Authorization', token)
      .expect(404, { statusCode: 404, code: 'OFFERING_NOT_FOUND', message: 'Offering not found' })
  })

  it('POST …/generate responde 200 com { created, offerings }', async () => {
    offerings.generate.mockResolvedValue({ created: 1, offerings: [{ id: 'o-1' }] })
    await http()
      .post(`${O}/generate`)
      .set('Authorization', token)
      .expect(200, { created: 1, offerings: [{ id: 'o-1' }] })
    expect(offerings.generate).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1')
  })

  it('semestre fechado dá 409 TERM_STATUS_FORBIDS com params', async () => {
    offerings.generate.mockRejectedValue(
      new AppException('TERM_STATUS_FORBIDS', { status: 'FINISHED', action: 'edit' }),
    )
    const res = await http().post(`${O}/generate`).set('Authorization', token).expect(409)
    expect(res.body).toMatchObject({
      code: 'TERM_STATUS_FORBIDS',
      params: { status: 'FINISHED', action: 'edit' },
    })
  })
})
