import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { SubjectsService } from '@modules/subjects/subjects.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('disciplinas', () => {
  let app: INestApplication<App>
  let token: string
  const subjects = {
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
      .overrideProvider(SubjectsService)
      .useValue(subjects)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const PATH = ['acme', 'sede', 'c-1', 'k-1']
  const S = '/api/organizations/acme/units/sede/courses/c-1/curricula/k-1/subjects'

  it('sem token dá 401', async () => {
    await http().get(S).expect(401)
    await http().delete(`${S}/s-1`).expect(401)
  })

  it('POST normaliza o corpo e responde 201', async () => {
    subjects.create.mockResolvedValue({ id: 's-1' })
    await http()
      .post(S)
      .set('Authorization', token)
      .send({ name: ' Matemática I ', code: 'mat-101', workload: 80, color: '#1e88e5' })
      .expect(201, { id: 's-1' })
    expect(subjects.create).toHaveBeenCalledWith('user-1', ...PATH, {
      name: 'Matemática I',
      code: 'MAT-101',
      workload: 80,
      level: 1,
      color: '#1E88E5',
    })
  })

  it('POST fora da regra dá 400 com os itens do Zod', async () => {
    const res = await http()
      .post(S)
      .set('Authorization', token)
      .send({ name: 'X', code: 'X', workload: 0, color: 'azul' })
      .expect(400)
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [
        { path: 'workload', code: 'too_small' },
        { path: 'color', code: 'invalid_format' },
      ],
    })
    expect(subjects.create).not.toHaveBeenCalled()
  })

  it('GET lista e lê uma', async () => {
    subjects.list.mockResolvedValue([])
    await http().get(S).set('Authorization', token).expect(200, [])
    expect(subjects.list).toHaveBeenCalledWith('user-1', ...PATH)

    subjects.get.mockResolvedValue({ id: 's-1' })
    await http().get(`${S}/s-1`).set('Authorization', token).expect(200, { id: 's-1' })
    expect(subjects.get).toHaveBeenCalledWith('user-1', ...PATH, 's-1')
  })

  it('PATCH repassa o corpo; sem campo válido dá EMPTY_UPDATE', async () => {
    subjects.update.mockResolvedValue({ id: 's-1' })
    await http()
      .patch(`${S}/s-1`)
      .set('Authorization', token)
      .send({ workload: 70, curriculumId: 'outro' })
      .expect(200)
    expect(subjects.update).toHaveBeenCalledWith('user-1', ...PATH, 's-1', { workload: 70 })

    const res = await http().patch(`${S}/s-1`).set('Authorization', token).send({}).expect(400)
    expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
  })

  it('DELETE responde 204', async () => {
    await http().delete(`${S}/s-1`).set('Authorization', token).expect(204)
    expect(subjects.remove).toHaveBeenCalledWith('user-1', ...PATH, 's-1')
  })

  it.each([
    ['SUBJECT_NOT_FOUND', 404, 'Subject not found'],
    ['SUBJECT_INACTIVE', 409, 'Subject is inactive'],
    ['SUBJECT_CODE_IN_USE', 409, 'Subject code already in use'],
    ['SUBJECT_IN_USE', 409, 'Subject is used by an offering'],
  ] as const)('erro de regra %s sai com o código', async (code, statusCode, message) => {
    subjects.remove.mockRejectedValue(new AppException(code))
    await http()
      .delete(`${S}/s-1`)
      .set('Authorization', token)
      .expect(statusCode, { statusCode, code, message })
  })
})
