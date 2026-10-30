import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { AuthService } from '@modules/auth/auth.service'

import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'

const user = { id: 'user-1', email: 'ana@ifce.edu.br', name: 'Ana', systemRole: 'USER' }
const session = { refreshToken: 'rt-novo', expiresAt: new Date() }

function cookieHeader(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined
  return header?.find((c) => c.startsWith('schdlr_refresh=')) ?? ''
}

describe('/api/auth', () => {
  let app: INestApplication<App>
  let jwt: JwtService
  const auth = {
    signUp: jest.fn(),
    requestCode: jest.fn(),
    signIn: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue(auth)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    jwt = moduleRef.get(JwtService)
  })

  afterAll(() => app.close())
  beforeEach(() => jest.resetAllMocks())

  const http = () => request(app.getHttpServer())

  it('sign-up normaliza o e-mail e responde 202', async () => {
    await http()
      .post('/api/auth/sign-up')
      .send({ name: ' Ana ', email: ' Ana@IFCE.edu.br ' })
      .expect(202)
    expect(auth.signUp).toHaveBeenCalledWith({ name: 'Ana', email: 'ana@ifce.edu.br' })
  })

  it('corpo inválido dá 400 VALIDATION_FAILED, com código e params por campo', async () => {
    const res = await http().post('/api/auth/sign-in').send({ email: 'x' }).expect(400)
    expect(res.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      errors: [
        {
          path: 'email',
          code: 'invalid_format',
          message: expect.any(String) as string,
          params: { format: 'email' },
        },
        {
          path: 'code',
          code: 'invalid_type',
          message: expect.any(String) as string,
          params: { expected: 'string' },
        },
      ],
    })
  })

  it('code responde 202', async () => {
    await http().post('/api/auth/code').send({ email: 'ninguem@x.dev' }).expect(202)
  })

  it('sign-in devolve token e usuário e grava o cookie', async () => {
    auth.signIn.mockResolvedValue({ accessToken: 'jwt', user, session })

    const res = await http()
      .post('/api/auth/sign-in')
      .send({ email: 'ana@ifce.edu.br', code: '123456' })
      .expect(200, { accessToken: 'jwt', user })

    const cookie = cookieHeader(res)
    expect(cookie).toContain('schdlr_refresh=rt-novo')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/api/auth')
    expect(cookie).not.toContain('Secure')
  })

  it('sign-in recusado repassa o 401 com o código', async () => {
    auth.signIn.mockRejectedValue(new AppException('INVALID_OR_EXPIRED_CODE'))
    await http()
      .post('/api/auth/sign-in')
      .send({ email: 'ana@ifce.edu.br', code: '123456' })
      .expect(401, {
        statusCode: 401,
        code: 'INVALID_OR_EXPIRED_CODE',
        message: 'Invalid or expired code',
      })
  })

  it('refresh lê o cookie e grava o novo', async () => {
    auth.refresh.mockResolvedValue({ accessToken: 'jwt2', session })

    const res = await http()
      .post('/api/auth/refresh')
      .set('Cookie', 'schdlr_refresh=rt-velho')
      .expect(200, { accessToken: 'jwt2' })

    expect(auth.refresh).toHaveBeenCalledWith('rt-velho')
    expect(cookieHeader(res)).toContain('schdlr_refresh=rt-novo')
  })

  it('refresh recusado dá 401 e apaga o cookie', async () => {
    auth.refresh.mockRejectedValue(new AppException('UNAUTHORIZED'))

    const res = await http()
      .post('/api/auth/refresh')
      .expect(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' })

    expect(auth.refresh).toHaveBeenCalledWith(undefined)
    expect(cookieHeader(res)).toMatch(
      /^schdlr_refresh=;.*Path=\/api\/auth.*Expires=Thu, 01 Jan 1970/,
    )
  })

  it.each([
    ['com cookie', 'schdlr_refresh=rt', 'rt'],
    ['sem cookie', '', undefined],
  ])('logout %s dá 204 e apaga o cookie', async (_label, cookie, token) => {
    const res = await http().post('/api/auth/logout').set('Cookie', cookie).expect(204)
    expect(auth.logout).toHaveBeenCalledWith(token)
    expect(cookieHeader(res)).toContain('schdlr_refresh=;')
  })

  it('me exige token', async () => {
    await http()
      .get('/api/auth/me')
      .expect(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' })
    expect(auth.me).not.toHaveBeenCalled()
  })

  it('me devolve o usuário do token', async () => {
    auth.me.mockResolvedValue(user)
    const token = jwt.sign({ sub: 'user-1' })

    await http().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200, user)
    expect(auth.me).toHaveBeenCalledWith('user-1')
  })
})
