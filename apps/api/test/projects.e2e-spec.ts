import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { ProjectsService } from '@modules/projects/projects.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('projetos', () => {
  let app: INestApplication<App>
  let token: string
  const projects = {
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
      .overrideProvider(ProjectsService)
      .useValue(projects)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const P = '/api/organizations/acme/units/sede/projects'

  it('sem token dá 401', async () => {
    await http().get(P).expect(401)
    await http().post(`${P}/p-1/status`).expect(401)
  })

  it('POST põe 5 dias, ignora status e responde 201', async () => {
    projects.create.mockResolvedValue({ id: 'p-1' })
    await http()
      .post(P)
      .set('Authorization', token)
      .send({ name: 'INFO 2026.1', termId: 't-1', curriculumId: 'k-1', status: 'DRAFT' })
      .expect(201, { id: 'p-1' })
    expect(projects.create).toHaveBeenCalledWith('user-1', 'acme', 'sede', {
      name: 'INFO 2026.1',
      termId: 't-1',
      curriculumId: 'k-1',
      workingDays: 5,
    })
  })

  it('POST com workingDays 7 dá 400', async () => {
    await http()
      .post(P)
      .set('Authorization', token)
      .send({ name: 'Y', termId: 't-1', curriculumId: 'k-1', workingDays: 7 })
      .expect(400)
    expect(projects.create).not.toHaveBeenCalled()
  })

  it('GET lista com ?termId= e ?status=; status fora do enum dá 400', async () => {
    projects.list.mockResolvedValue([])
    await http().get(`${P}?termId=t-1&status=PUBLISHED`).set('Authorization', token).expect(200, [])
    expect(projects.list).toHaveBeenCalledWith('user-1', 'acme', 'sede', {
      termId: 't-1',
      status: 'PUBLISHED',
    })
    await http().get(`${P}?status=ARCHIVED`).set('Authorization', token).expect(400)
  })

  it('GET lê um', async () => {
    projects.get.mockResolvedValue({ id: 'p-1' })
    await http().get(`${P}/p-1`).set('Authorization', token).expect(200, { id: 'p-1' })
    expect(projects.get).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1')
  })

  it('PATCH ignora termId, curriculumId e status; vazio dá EMPTY_UPDATE', async () => {
    projects.update.mockResolvedValue({ id: 'p-1' })
    await http()
      .patch(`${P}/p-1`)
      .set('Authorization', token)
      .send({ workingDays: 6, termId: 't-2', curriculumId: 'k-2', status: 'DRAFT' })
      .expect(200)
    expect(projects.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', {
      workingDays: 6,
    })
    const res = await http()
      .patch(`${P}/p-1`)
      .set('Authorization', token)
      .send({ status: 'DRAFT' })
      .expect(400)
    expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
  })

  it('POST …/status responde 200; DELETE responde 204', async () => {
    projects.changeStatus.mockResolvedValue({ id: 'p-1', status: 'PUBLISHED' })
    await http()
      .post(`${P}/p-1/status`)
      .set('Authorization', token)
      .send({ status: 'PUBLISHED' })
      .expect(200, { id: 'p-1', status: 'PUBLISHED' })
    expect(projects.changeStatus).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', {
      status: 'PUBLISHED',
    })
    await http().delete(`${P}/p-1`).set('Authorization', token).expect(204)
    expect(projects.remove).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1')
  })

  it('TERM_STATUS_FORBIDS e INVALID_PROJECT_TRANSITION saem com params', async () => {
    projects.remove.mockRejectedValueOnce(
      new AppException('TERM_STATUS_FORBIDS', { status: 'ADJUSTMENTS', action: 'delete' }),
    )
    await http()
      .delete(`${P}/p-1`)
      .set('Authorization', token)
      .expect(409, {
        statusCode: 409,
        code: 'TERM_STATUS_FORBIDS',
        message: 'Term status does not allow this action',
        params: { status: 'ADJUSTMENTS', action: 'delete' },
      })

    projects.changeStatus.mockRejectedValueOnce(
      new AppException('INVALID_PROJECT_TRANSITION', { from: 'DRAFT', to: 'DRAFT' }),
    )
    await http()
      .post(`${P}/p-1/status`)
      .set('Authorization', token)
      .send({ status: 'DRAFT' })
      .expect(409, {
        statusCode: 409,
        code: 'INVALID_PROJECT_TRANSITION',
        message: 'Invalid project status transition',
        params: { from: 'DRAFT', to: 'DRAFT' },
      })
  })

  it.each([
    ['PROJECT_NOT_FOUND', 404, 'Project not found'],
    ['PROJECT_NAME_IN_USE', 409, 'Project name already in use'],
    ['WORKING_DAYS_IN_USE', 409, 'Saturday has board slots'],
  ] as const)('erro de regra %s sai com o código', async (code, statusCode, message) => {
    projects.update.mockRejectedValue(new AppException(code))
    await http()
      .patch(`${P}/p-1`)
      .set('Authorization', token)
      .send({ name: 'X' })
      .expect(statusCode, { statusCode, code, message })
  })
})
