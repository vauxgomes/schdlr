import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TimeSlotsService } from '@modules/time-slots/time-slots.service'
import { TimeTablesService } from '@modules/time-tables/time-tables.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('blocos de horários', () => {
  let app: INestApplication<App>
  let token: string
  const timeTables = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    duplicate: jest.fn(),
  }
  const timeSlots = { create: jest.fn(), update: jest.fn(), remove: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(TimeTablesService)
      .useValue(timeTables)
      .overrideProvider(TimeSlotsService)
      .useValue(timeSlots)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const B = '/api/organizations/acme/units/sede/time-tables'

  it('sem token dá 401', async () => {
    await http().get(B).expect(401)
    await http().post(`${B}/t-1/slots`).expect(401)
  })

  describe('blocos', () => {
    it('POST com horários responde 201', async () => {
      timeTables.create.mockResolvedValue({ id: 't-1' })
      await http()
        .post(B)
        .set('Authorization', token)
        .send({ name: 'Manhã', slots: [{ name: ' M1 ', startTime: '07:00', endTime: '07:50' }] })
        .expect(201, { id: 't-1' })
      expect(timeTables.create).toHaveBeenCalledWith('user-1', 'acme', 'sede', {
        name: 'Manhã',
        slots: [{ name: 'M1', startTime: '07:00', endTime: '07:50' }],
      })
    })

    it('POST com horários sobrepostos dá 400 SLOTS_OVERLAP em slots.1', async () => {
      const res = await http()
        .post(B)
        .set('Authorization', token)
        .send({
          name: 'X',
          slots: [
            { name: 'A', startTime: '07:00', endTime: '08:00' },
            { name: 'B', startTime: '07:30', endTime: '08:30' },
          ],
        })
        .expect(400)
      expect(res.body).toMatchObject({ errors: [{ path: 'slots.1', code: 'SLOTS_OVERLAP' }] })
      expect(timeTables.create).not.toHaveBeenCalled()
    })

    it('GET lista e lê um', async () => {
      timeTables.list.mockResolvedValue([])
      await http().get(B).set('Authorization', token).expect(200, [])
      expect(timeTables.list).toHaveBeenCalledWith('user-1', 'acme', 'sede')
      timeTables.get.mockResolvedValue({ id: 't-1' })
      await http().get(`${B}/t-1`).set('Authorization', token).expect(200, { id: 't-1' })
      expect(timeTables.get).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1')
    })

    it('PATCH ignora slots; vazio dá EMPTY_UPDATE', async () => {
      timeTables.update.mockResolvedValue({ id: 't-1' })
      await http()
        .patch(`${B}/t-1`)
        .set('Authorization', token)
        .send({ isActive: false, slots: [] })
        .expect(200)
      expect(timeTables.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1', {
        isActive: false,
      })
      const res = await http().patch(`${B}/t-1`).set('Authorization', token).send({}).expect(400)
      expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
    })

    it('DELETE responde 204; duplicate responde 201', async () => {
      await http().delete(`${B}/t-1`).set('Authorization', token).expect(204)
      expect(timeTables.remove).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1')

      timeTables.duplicate.mockResolvedValue({ id: 't-2' })
      await http()
        .post(`${B}/t-1/duplicate`)
        .set('Authorization', token)
        .send({ name: 'Manhã 2027' })
        .expect(201, { id: 't-2' })
      expect(timeTables.duplicate).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1', {
        name: 'Manhã 2027',
      })
    })
  })

  describe('horários', () => {
    it('POST responde 201 com o bloco; 24:00 dá 400', async () => {
      timeSlots.create.mockResolvedValue({ id: 't-1', slots: [] })
      await http()
        .post(`${B}/t-1/slots`)
        .set('Authorization', token)
        .send({ name: 'N5', startTime: '23:10', endTime: '23:59' })
        .expect(201, { id: 't-1', slots: [] })
      expect(timeSlots.create).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1', {
        name: 'N5',
        startTime: '23:10',
        endTime: '23:59',
      })

      const res = await http()
        .post(`${B}/t-1/slots`)
        .set('Authorization', token)
        .send({ name: 'N6', startTime: '23:10', endTime: '24:00' })
        .expect(400)
      expect(res.body).toMatchObject({ errors: [{ path: 'endTime', code: 'invalid_format' }] })
    })

    it('POST com fim antes do início dá END_NOT_AFTER_START', async () => {
      const res = await http()
        .post(`${B}/t-1/slots`)
        .set('Authorization', token)
        .send({ name: 'M3', startTime: '09:00', endTime: '08:00' })
        .expect(400)
      expect(res.body).toMatchObject({ errors: [{ path: 'endTime', code: 'END_NOT_AFTER_START' }] })
    })

    it('PATCH e DELETE', async () => {
      timeSlots.update.mockResolvedValue({ id: 't-1' })
      await http()
        .patch(`${B}/t-1/slots/s-1`)
        .set('Authorization', token)
        .send({ name: 'M1b' })
        .expect(200)
      expect(timeSlots.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1', 's-1', {
        name: 'M1b',
      })
      await http().delete(`${B}/t-1/slots/s-1`).set('Authorization', token).expect(204)
      expect(timeSlots.remove).toHaveBeenCalledWith('user-1', 'acme', 'sede', 't-1', 's-1')
    })

    it('TIME_SLOT_OVERLAP e TIME_TABLE_FULL saem com params', async () => {
      const overlap = { slotId: 's-2', name: 'M2', startTime: '07:50', endTime: '08:40' }
      timeSlots.create.mockRejectedValueOnce(new AppException('TIME_SLOT_OVERLAP', overlap))
      await http()
        .post(`${B}/t-1/slots`)
        .set('Authorization', token)
        .send({ name: 'M3', startTime: '08:20', endTime: '09:10' })
        .expect(409, {
          statusCode: 409,
          code: 'TIME_SLOT_OVERLAP',
          message: 'Time slot overlaps another',
          params: overlap,
        })

      timeSlots.create.mockRejectedValueOnce(new AppException('TIME_TABLE_FULL', { max: 48 }))
      await http()
        .post(`${B}/t-1/slots`)
        .set('Authorization', token)
        .send({ name: 'M3', startTime: '08:40', endTime: '09:30' })
        .expect(409, {
          statusCode: 409,
          code: 'TIME_TABLE_FULL',
          message: 'Time table has too many slots',
          params: { max: 48 },
        })
    })
  })

  it.each([
    ['TIME_TABLE_NOT_FOUND', 404, 'Time table not found'],
    ['TIME_TABLE_NAME_IN_USE', 409, 'Time table name already in use'],
    ['TIME_TABLE_INACTIVE', 409, 'Time table is inactive'],
    ['TIME_TABLE_IN_USE', 409, 'Time table is used by a board'],
    ['TIME_SLOT_NOT_FOUND', 404, 'Time slot not found'],
    ['TIME_SLOT_NAME_IN_USE', 409, 'Time slot name already in use'],
    ['TIME_SLOT_IN_USE', 409, 'Time slot is used by a board slot'],
  ] as const)('erro de regra %s sai com o código', async (code, statusCode, message) => {
    timeSlots.remove.mockRejectedValue(new AppException(code))
    await http()
      .delete(`${B}/t-1/slots/s-1`)
      .set('Authorization', token)
      .expect(statusCode, { statusCode, code, message })
  })
})
