import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TeachersService } from '@modules/teachers/teachers.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('professores', () => {
  let app: INestApplication<App>
  let token: string
  const teachers = {
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
      .overrideProvider(TeachersService)
      .useValue(teachers)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const T = '/api/organizations/acme/teachers'

  it('sem token dá 401', async () => {
    await http().get(T).expect(401)
    await http().delete(`${T}/t-1`).expect(401)
  })

  it('POST normaliza o corpo e responde 201', async () => {
    teachers.create.mockResolvedValue({ id: 't-1' })
    await http()
      .post(T)
      .set('Authorization', token)
      .send({ name: ' Professor de Matemática 1 ', area: 'Matemática', notes: '' })
      .expect(201, { id: 't-1' })
    expect(teachers.create).toHaveBeenCalledWith('user-1', 'acme', {
      name: 'Professor de Matemática 1',
      area: 'Matemática',
      notes: null,
    })

    await http()
      .post(T)
      .set('Authorization', token)
      .send({ name: 'Ana', userId: 'u-2' })
      .expect(201)
    expect(teachers.create).toHaveBeenLastCalledWith('user-1', 'acme', {
      name: 'Ana',
      area: null,
      notes: null,
      userId: 'u-2',
    })
  })

  it('POST sem nome dá 400', async () => {
    await http().post(T).set('Authorization', token).send({}).expect(400)
    expect(teachers.create).not.toHaveBeenCalled()
  })

  it('GET lista com os filtros; booleano inválido dá 400', async () => {
    teachers.list.mockResolvedValue([])
    await http()
      .get(`${T}?q=mat&active=true&linked=false`)
      .set('Authorization', token)
      .expect(200, [])
    expect(teachers.list).toHaveBeenCalledWith('user-1', 'acme', {
      q: 'mat',
      active: true,
      linked: false,
    })
    await http().get(`${T}?linked=talvez`).set('Authorization', token).expect(400)
  })

  it('GET de um', async () => {
    teachers.get.mockResolvedValue({ id: 't-1' })
    await http().get(`${T}/t-1`).set('Authorization', token).expect(200, { id: 't-1' })
    expect(teachers.get).toHaveBeenCalledWith('user-1', 'acme', 't-1')
  })

  it('PATCH descarta userId; só com ele dá EMPTY_UPDATE', async () => {
    teachers.update.mockResolvedValue({ id: 't-1' })
    await http()
      .patch(`${T}/t-1`)
      .set('Authorization', token)
      .send({ userId: 'u-2', notes: 'edital 12' })
      .expect(200)
    expect(teachers.update).toHaveBeenCalledWith('user-1', 'acme', 't-1', { notes: 'edital 12' })

    const res = await http()
      .patch(`${T}/t-1`)
      .set('Authorization', token)
      .send({ userId: 'u-2' })
      .expect(400)
    expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
  })

  it('DELETE responde 204', async () => {
    await http().delete(`${T}/t-1`).set('Authorization', token).expect(204)
    expect(teachers.remove).toHaveBeenCalledWith('user-1', 'acme', 't-1')
  })

  it.each([
    ['TEACHER_NOT_FOUND', 404, 'Teacher not found'],
    ['TEACHER_NAME_IN_USE', 409, 'Teacher name already in use'],
    ['TEACHER_INACTIVE', 409, 'Teacher is inactive'],
    ['TEACHER_IN_USE', 409, 'Teacher has allocated offerings'],
    ['TEACHER_HAS_USER', 409, 'Teacher has a user'],
    ['INVALID_TEACHER_USER', 400, 'User must be an active member of the organization'],
    ['USER_ALREADY_TEACHER', 409, 'User is already a teacher in this organization'],
  ] as const)('%s sai com o código e o status', async (code, statusCode, message) => {
    teachers.remove.mockRejectedValue(new AppException(code))
    await http()
      .delete(`${T}/t-1`)
      .set('Authorization', token)
      .expect(statusCode, { statusCode, code, message })
  })
})
