import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { InvitationsService } from '@modules/invitations/invitations.service'
import { MembersService } from '@modules/members/members.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

describe('membros e convites', () => {
  let app: INestApplication<App>
  let token: string
  const members = { list: jest.fn(), update: jest.fn(), remove: jest.fn() }
  const invitations = {
    listForUnit: jest.fn(),
    invite: jest.fn(),
    cancel: jest.fn(),
    listMine: jest.fn(),
    respondById: jest.fn(),
    findByToken: jest.fn(),
    respondByToken: jest.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(MembersService)
      .useValue(members)
      .overrideProvider(InvitationsService)
      .useValue(invitations)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    token = `Bearer ${moduleRef.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())
  const U = '/api/organizations/acme/units/sede'

  describe('membros', () => {
    it('sem token dá 401', async () => {
      await http().get(`${U}/members`).expect(401)
    })

    it('GET lista', async () => {
      members.list.mockResolvedValue([{ userId: 'u' }])
      await http()
        .get(`${U}/members`)
        .set('Authorization', token)
        .expect(200, [{ userId: 'u' }])
      expect(members.list).toHaveBeenCalledWith('user-1', 'acme', 'sede')
    })

    it('PATCH repassa as flags; sem flag dá EMPTY_UPDATE', async () => {
      members.update.mockResolvedValue({ userId: 'u', isTeacher: true })
      await http()
        .patch(`${U}/members/u`)
        .set('Authorization', token)
        .send({ isTeacher: true, email: 'x' })
        .expect(200)
      expect(members.update).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'u', {
        isTeacher: true,
      })

      const res = await http()
        .patch(`${U}/members/u`)
        .set('Authorization', token)
        .send({})
        .expect(400)
      expect(res.body).toMatchObject({ errors: [{ code: 'EMPTY_UPDATE' }] })
    })

    it('DELETE responde 204', async () => {
      await http().delete(`${U}/members/user-1`).set('Authorization', token).expect(204)
      expect(members.remove).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'user-1')
    })

    it('erro de regra sai com o código', async () => {
      members.update.mockRejectedValue(new AppException('MEMBER_NOT_FOUND'))
      await http()
        .patch(`${U}/members/x`)
        .set('Authorization', token)
        .send({ isTeacher: true })
        .expect(404, { statusCode: 404, code: 'MEMBER_NOT_FOUND', message: 'Member not found' })
    })
  })

  describe('convites da unidade', () => {
    it('POST normaliza e põe as flags padrão; responde 201', async () => {
      invitations.invite.mockResolvedValue({ id: 'inv-1' })
      await http()
        .post(`${U}/invitations`)
        .set('Authorization', token)
        .send({ email: ' Guest@SCHDLR.dev ', isTeacher: true })
        .expect(201, { id: 'inv-1' })
      expect(invitations.invite).toHaveBeenCalledWith('user-1', 'acme', 'sede', {
        email: 'guest@schdlr.dev',
        isManager: false,
        isTeacher: true,
      })
    })

    it('POST com e-mail inválido dá 400', async () => {
      await http()
        .post(`${U}/invitations`)
        .set('Authorization', token)
        .send({ email: 'x' })
        .expect(400)
      expect(invitations.invite).not.toHaveBeenCalled()
    })

    it('GET filtra por status; valor fora do enum dá 400', async () => {
      invitations.listForUnit.mockResolvedValue([])
      await http()
        .get(`${U}/invitations?status=EXPIRED`)
        .set('Authorization', token)
        .expect(200, [])
      expect(invitations.listForUnit).toHaveBeenCalledWith('user-1', 'acme', 'sede', {
        status: 'EXPIRED',
      })
      await http().get(`${U}/invitations?status=OUTRO`).set('Authorization', token).expect(400)
    })

    it('cancel responde 200', async () => {
      invitations.cancel.mockResolvedValue({ status: 'CANCELLED' })
      await http()
        .post(`${U}/invitations/inv-1/cancel`)
        .set('Authorization', token)
        .expect(200, { status: 'CANCELLED' })
      expect(invitations.cancel).toHaveBeenCalledWith('user-1', 'acme', 'sede', 'inv-1')
    })
  })

  describe('convites do convidado', () => {
    it('GET /api/invitations exige token', async () => {
      await http().get('/api/invitations').expect(401)
      invitations.listMine.mockResolvedValue([])
      await http().get('/api/invitations').set('Authorization', token).expect(200, [])
      expect(invitations.listMine).toHaveBeenCalledWith('user-1')
    })

    it.each(['accept', 'reject'])('%s pelo id exige token e responde 200', async (action) => {
      await http().post(`/api/invitations/inv-1/${action}`).expect(401)
      invitations.respondById.mockResolvedValue({ id: 'inv-1' })
      await http().post(`/api/invitations/inv-1/${action}`).set('Authorization', token).expect(200)
      expect(invitations.respondById).toHaveBeenCalledWith('user-1', 'inv-1', action)
    })

    it('by-token é público', async () => {
      invitations.findByToken.mockResolvedValue({ status: 'PENDING' })
      invitations.respondByToken.mockResolvedValue({ status: 'ACCEPTED' })
      await http().get('/api/invitations/by-token/tok').expect(200, { status: 'PENDING' })
      await http().post('/api/invitations/by-token/tok/accept').expect(200, { status: 'ACCEPTED' })
      await http().post('/api/invitations/by-token/tok/reject').expect(200)
      expect(invitations.respondByToken).toHaveBeenCalledWith('tok', 'accept')
      expect(invitations.respondByToken).toHaveBeenCalledWith('tok', 'reject')
    })

    it('token desconhecido dá 404 INVITATION_NOT_FOUND', async () => {
      invitations.findByToken.mockRejectedValue(new AppException('INVITATION_NOT_FOUND'))
      await http().get('/api/invitations/by-token/outro').expect(404, {
        statusCode: 404,
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitation not found',
      })
    })

    it('vencido dá 410', async () => {
      invitations.respondByToken.mockRejectedValue(new AppException('INVITATION_EXPIRED'))
      await http()
        .post('/api/invitations/by-token/tok/accept')
        .expect(410)
        .expect((res) => expect(res.body).toMatchObject({ code: 'INVITATION_EXPIRED' }))
    })
  })
})
