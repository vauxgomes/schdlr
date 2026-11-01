import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { BoardSlotsService } from '@modules/board-slots/board-slots.service'
import { BoardsService } from '@modules/boards/boards.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('quadros e células', () => {
  let app: INestApplication<App>
  let token: string
  const boards = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  }
  const slots = { put: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(BoardsService)
      .useValue(boards)
      .overrideProvider(BoardSlotsService)
      .useValue(slots)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const B = '/api/organizations/acme/units/sede/projects/p-1/boards'

  it('sem token dá 401', async () => {
    await http().get(B).expect(401)
    await http().put(`${B}/b-1/slots/ts-1/1`).expect(401)
  })

  it('POST responde 201; sem timeTableId dá 400', async () => {
    boards.create.mockResolvedValue({ id: 'b-1' })
    await http()
      .post(B)
      .set('Authorization', token)
      .send({ name: 'INFO 2A', timeTableId: 'tt-1' })
      .expect(201, { id: 'b-1' })
    expect(boards.create).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', {
      name: 'INFO 2A',
      timeTableId: 'tt-1',
    })
    await http().post(B).set('Authorization', token).send({ name: 'INFO 2A' }).expect(400)
  })

  it('GET lista e lê um', async () => {
    boards.list.mockResolvedValue([])
    await http().get(B).set('Authorization', token).expect(200, [])
    expect(boards.list).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1')
    boards.get.mockResolvedValue({ id: 'b-1' })
    await http().get(`${B}/b-1`).set('Authorization', token).expect(200, { id: 'b-1' })
    expect(boards.get).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', 'b-1')
  })

  it('PATCH sem campo válido dá EMPTY_UPDATE; com célula dá 409 BOARD_NOT_EMPTY', async () => {
    const res = await http()
      .patch(`${B}/b-1`)
      .set('Authorization', token)
      .send({ projectId: 'p-2' })
      .expect(400)
    expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
    boards.update.mockRejectedValue(new AppException('BOARD_NOT_EMPTY'))
    await http()
      .patch(`${B}/b-1`)
      .set('Authorization', token)
      .send({ timeTableId: 'tt-2' })
      .expect(409, { statusCode: 409, code: 'BOARD_NOT_EMPTY', message: 'Board has slots' })
    expect(boards.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', 'b-1', {
      timeTableId: 'tt-2',
    })
  })

  it('DELETE responde 204', async () => {
    await http().delete(`${B}/b-1`).set('Authorization', token).expect(204)
    expect(boards.remove).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'p-1', 'b-1')
  })

  it('PUT da célula responde 200 com o estado inteiro', async () => {
    slots.put.mockResolvedValue({ weekday: 1, timeSlotId: 'ts-1' })
    const body = { offeringId: 'o-1', locationId: null, isBlocked: false }
    await http()
      .put(`${B}/b-1/slots/ts-1/1`)
      .set('Authorization', token)
      .send(body)
      .expect(200, { weekday: 1, timeSlotId: 'ts-1' })
    expect(slots.put).toHaveBeenCalledWith(
      'user-1',
      'acme',
      'sede',
      'p-1',
      'b-1',
      'ts-1',
      '1',
      body,
    )
  })

  it('PUT com campo faltando ou bloqueada com oferta dá 400', async () => {
    await http()
      .put(`${B}/b-1/slots/ts-1/1`)
      .set('Authorization', token)
      .send({ offeringId: 'o-1', isBlocked: false })
      .expect(400)
    const res = await http()
      .put(`${B}/b-1/slots/ts-1/1`)
      .set('Authorization', token)
      .send({ offeringId: 'o-1', locationId: null, isBlocked: true })
      .expect(400)
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'isBlocked', code: 'BLOCKED_SLOT_MUST_BE_EMPTY' }],
    })
    expect(slots.put).not.toHaveBeenCalled()
  })

  it('PUT fora da grade dá 404 BOARD_SLOT_NOT_FOUND', async () => {
    slots.put.mockRejectedValue(new AppException('BOARD_SLOT_NOT_FOUND'))
    await http()
      .put(`${B}/b-1/slots/ts-1/6`)
      .set('Authorization', token)
      .send({ offeringId: null, locationId: null, isBlocked: true })
      .expect(404, {
        statusCode: 404,
        code: 'BOARD_SLOT_NOT_FOUND',
        message: 'Board slot not found',
      })
  })
})
