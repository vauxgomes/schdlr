import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { CurriculaService } from '@modules/curricula/curricula.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('currículos', () => {
  let app: INestApplication<App>
  let token: string
  const curricula = {
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
      .overrideProvider(CurriculaService)
      .useValue(curricula)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const K = '/api/organizations/acme/units/sede/courses/c-1/curricula'

  it('sem token dá 401', async () => {
    await http().get(K).expect(401)
    await http().delete(`${K}/k-1`).expect(401)
  })

  it('POST normaliza o corpo e responde 201', async () => {
    curricula.create.mockResolvedValue({ id: 'k-1' })
    await http()
      .post(K)
      .set('Authorization', token)
      .send({ name: ' Matriz 2024 ', code: ' 2024 ', description: '' })
      .expect(201, { id: 'k-1' })
    expect(curricula.create).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'c-1', {
      name: 'Matriz 2024',
      code: '2024',
      description: null,
    })
  })

  it('POST sem código dá 400', async () => {
    await http().post(K).set('Authorization', token).send({ name: 'X' }).expect(400)
    expect(curricula.create).not.toHaveBeenCalled()
  })

  it('GET lista e lê um', async () => {
    curricula.list.mockResolvedValue([])
    await http().get(K).set('Authorization', token).expect(200, [])
    expect(curricula.list).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'c-1')

    curricula.get.mockResolvedValue({ id: 'k-1' })
    await http().get(`${K}/k-1`).set('Authorization', token).expect(200, { id: 'k-1' })
    expect(curricula.get).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'c-1', 'k-1')
  })

  it('PATCH repassa o corpo; sem campo válido dá EMPTY_UPDATE', async () => {
    curricula.update.mockResolvedValue({ id: 'k-1' })
    await http()
      .patch(`${K}/k-1`)
      .set('Authorization', token)
      .send({ description: null, courseId: 'outro' })
      .expect(200)
    expect(curricula.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'c-1', 'k-1', {
      description: null,
    })

    const res = await http().patch(`${K}/k-1`).set('Authorization', token).send({}).expect(400)
    expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
  })

  it('DELETE responde 204', async () => {
    await http().delete(`${K}/k-1`).set('Authorization', token).expect(204)
    expect(curricula.remove).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'c-1', 'k-1')
  })

  it.each([
    ['CURRICULUM_NOT_FOUND', 404, 'Curriculum not found'],
    ['CURRICULUM_INACTIVE', 409, 'Curriculum is inactive'],
    ['CURRICULUM_CODE_IN_USE', 409, 'Curriculum code already in use'],
    ['CURRICULUM_IN_USE', 409, 'Curriculum is used by a project'],
  ] as const)('erro de regra %s sai com o código', async (code, statusCode, message) => {
    curricula.remove.mockRejectedValue(new AppException(code))
    await http()
      .delete(`${K}/k-1`)
      .set('Authorization', token)
      .expect(statusCode, { statusCode, code, message })
  })
})
