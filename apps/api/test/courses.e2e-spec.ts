import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { CoursesService } from '@modules/courses/courses.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('cursos', () => {
  let app: INestApplication<App>
  let token: string
  const courses = { create: jest.fn(), list: jest.fn(), get: jest.fn(), update: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(CoursesService)
      .useValue(courses)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const C = '/api/organizations/acme/units/sede/courses'

  it('sem token dá 401', async () => {
    await http().get(C).expect(401)
    await http().get(`${C}/c-1`).expect(401)
  })

  it('POST normaliza o corpo e responde 201', async () => {
    courses.create.mockResolvedValue({ id: 'c-1' })
    await http()
      .post(C)
      .set('Authorization', token)
      .send({ name: ' Informática ', code: ' info ' })
      .expect(201, { id: 'c-1' })
    expect(courses.create).toHaveBeenCalledWith('user-1', 'acme', 'sede', {
      name: 'Informática',
      code: 'INFO',
      coordinatorId: null,
    })
  })

  it('POST com código fora do formato dá 400', async () => {
    await http().post(C).set('Authorization', token).send({ name: 'X', code: 'a b' }).expect(400)
    expect(courses.create).not.toHaveBeenCalled()
  })

  it('GET lista e lê um', async () => {
    courses.list.mockResolvedValue([])
    await http().get(C).set('Authorization', token).expect(200, [])
    expect(courses.list).toHaveBeenCalledWith('user-1', 'acme', 'sede')

    courses.get.mockResolvedValue({ id: 'c-1' })
    await http().get(`${C}/c-1`).set('Authorization', token).expect(200, { id: 'c-1' })
    expect(courses.get).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'c-1')
  })

  it('PATCH repassa o corpo; sem campo válido dá EMPTY_UPDATE', async () => {
    courses.update.mockResolvedValue({ id: 'c-1' })
    await http()
      .patch(`${C}/c-1`)
      .set('Authorization', token)
      .send({ code: null, coordinatorId: 'u-2', unitId: 'outra' })
      .expect(200)
    expect(courses.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'c-1', {
      code: null,
      coordinatorId: 'u-2',
    })

    const res = await http()
      .patch(`${C}/c-1`)
      .set('Authorization', token)
      .send({ unitId: 'outra' })
      .expect(400)
    expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
  })

  it.each([
    ['COURSE_NOT_FOUND', 404, 'Course not found'],
    ['COURSE_INACTIVE', 409, 'Course is inactive'],
    ['COURSE_CODE_IN_USE', 409, 'Course code already in use'],
    ['COORDINATOR_NOT_A_MEMBER', 400, 'Coordinator is not a member'],
  ] as const)('erro de regra %s sai com o código', async (code, statusCode, message) => {
    courses.update.mockRejectedValue(new AppException(code))
    await http()
      .patch(`${C}/c-1`)
      .set('Authorization', token)
      .send({ name: 'X' })
      .expect(statusCode, { statusCode, code, message })
  })

  it('PLAN_LIMIT_REACHED sai com params', async () => {
    courses.create.mockRejectedValue(
      new AppException('PLAN_LIMIT_REACHED', { limit: 'coursesPerUnit', max: 5 }),
    )
    await http()
      .post(C)
      .set('Authorization', token)
      .send({ name: 'X' })
      .expect(403, {
        statusCode: 403,
        code: 'PLAN_LIMIT_REACHED',
        message: 'Plan limit reached',
        params: { limit: 'coursesPerUnit', max: 5 },
      })
  })
})
