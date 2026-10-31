import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TermsService } from '@modules/terms/terms.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('semestres', () => {
  let app: INestApplication<App>
  let token: string
  const terms = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    changeStatus: jest.fn(),
    remove: jest.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(TermsService)
      .useValue(terms)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const T = '/api/organizations/acme/units/sede/terms'

  it('sem token dá 401', async () => {
    await http().get(T).expect(401)
    await http().post(`${T}/t-1/status`).expect(401)
  })

  it('POST ignora status e responde 201', async () => {
    terms.create.mockResolvedValue({ id: 't-1' })
    await http()
      .post(T)
      .set('Authorization', token)
      .send({ name: '2026.1', startDate: '2026-02-02', endDate: '2026-07-04', status: 'STARTED' })
      .expect(201, { id: 't-1' })
    expect(terms.create).toHaveBeenCalledWith('user-1', 'acme', 'sede', {
      name: '2026.1',
      startDate: '2026-02-02',
      endDate: '2026-07-04',
    })
  })

  it('POST com fim antes do início dá 400 END_BEFORE_START', async () => {
    const res = await http()
      .post(T)
      .set('Authorization', token)
      .send({ name: 'X', startDate: '2026-08-01', endDate: '2026-07-01' })
      .expect(400)
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'endDate', code: 'END_BEFORE_START' }],
    })
    expect(terms.create).not.toHaveBeenCalled()
  })

  it('GET lista com ?status=; fora do enum dá 400', async () => {
    terms.list.mockResolvedValue([])
    await http().get(`${T}?status=FINISHED`).set('Authorization', token).expect(200, [])
    expect(terms.list).toHaveBeenCalledWith('user-1', 'acme', 'sede', { status: 'FINISHED' })
    await http().get(`${T}?status=OPEN`).set('Authorization', token).expect(400)
  })

  it('GET lê um', async () => {
    terms.get.mockResolvedValue({ id: 't-1' })
    await http().get(`${T}/t-1`).set('Authorization', token).expect(200, { id: 't-1' })
    expect(terms.get).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1')
  })

  it('PATCH repassa nome e datas, sem status; vazio dá EMPTY_UPDATE', async () => {
    terms.update.mockResolvedValue({ id: 't-1' })
    await http()
      .patch(`${T}/t-1`)
      .set('Authorization', token)
      .send({ endDate: '2026-07-31', status: 'FINISHED' })
      .expect(200)
    expect(terms.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1', {
      endDate: '2026-07-31',
    })

    const res = await http()
      .patch(`${T}/t-1`)
      .set('Authorization', token)
      .send({ status: 'FINISHED' })
      .expect(400)
    expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
  })

  it('POST …/status responde 200; status fora do enum dá 400', async () => {
    terms.changeStatus.mockResolvedValue({ id: 't-1', status: 'ADJUSTMENTS' })
    await http()
      .post(`${T}/t-1/status`)
      .set('Authorization', token)
      .send({ status: 'ADJUSTMENTS' })
      .expect(200, { id: 't-1', status: 'ADJUSTMENTS' })
    expect(terms.changeStatus).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1', {
      status: 'ADJUSTMENTS',
    })
    await http()
      .post(`${T}/t-1/status`)
      .set('Authorization', token)
      .send({ status: 'OPEN' })
      .expect(400)
  })

  it('DELETE responde 204', async () => {
    await http().delete(`${T}/t-1`).set('Authorization', token).expect(204)
    expect(terms.remove).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1')
  })

  it('INVALID_TERM_TRANSITION sai com params', async () => {
    terms.changeStatus.mockRejectedValue(
      new AppException('INVALID_TERM_TRANSITION', { from: 'PLANNING', to: 'STARTED' }),
    )
    await http()
      .post(`${T}/t-1/status`)
      .set('Authorization', token)
      .send({ status: 'STARTED' })
      .expect(409, {
        statusCode: 409,
        code: 'INVALID_TERM_TRANSITION',
        message: 'Invalid term status transition',
        params: { from: 'PLANNING', to: 'STARTED' },
      })
  })

  it.each([
    ['TERM_NOT_FOUND', 404, 'Term not found'],
    ['TERM_NAME_IN_USE', 409, 'Term name already in use'],
    ['TERM_CLOSED', 409, 'Term is closed'],
    ['TERM_IN_USE', 409, 'Term has projects'],
  ] as const)('erro de regra %s sai com o código', async (code, statusCode, message) => {
    terms.remove.mockRejectedValue(new AppException(code))
    await http()
      .delete(`${T}/t-1`)
      .set('Authorization', token)
      .expect(statusCode, { statusCode, code, message })
  })
})
