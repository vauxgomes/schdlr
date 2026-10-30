import { JwtService } from '@nestjs/jwt'
import { User } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { MailService } from '@infra/mail/mail.service'

import { AuthService } from './auth.service'
import { OtpService } from './otp.service'
import { SessionService } from './session.service'

const user = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'ana@ifce.edu.br',
  name: 'Ana',
  systemRole: 'USER',
  isActive: true,
  emailVerifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

async function appError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  const exception = error as AppException
  return { status: exception.getStatus(), code: exception.code }
}

describe('AuthService', () => {
  let users: Record<'findUnique' | 'create' | 'update', jest.Mock>
  let otp: Record<'issue' | 'isInCooldown' | 'consume', jest.Mock>
  let sessions: Record<'create' | 'rotate' | 'revoke', jest.Mock>
  let mail: { sendOtpCode: jest.Mock }
  let service: AuthService

  beforeEach(() => {
    users = { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }
    otp = {
      issue: jest.fn().mockResolvedValue({ code: '123456' }),
      isInCooldown: jest.fn().mockResolvedValue(false),
      consume: jest.fn(),
    }
    sessions = {
      create: jest.fn().mockResolvedValue({ refreshToken: 'rt', expiresAt: new Date() }),
      rotate: jest.fn(),
      revoke: jest.fn(),
    }
    mail = { sendOtpCode: jest.fn() }
    service = new AuthService(
      { user: users } as unknown as DatabaseService,
      otp as unknown as OtpService,
      sessions as unknown as SessionService,
      mail as unknown as MailService,
      { sign: () => 'jwt' } as unknown as JwtService,
    )
  })

  describe('signUp', () => {
    it('cria o usuário sem assinatura e envia código SIGN_UP', async () => {
      users.findUnique.mockResolvedValue(null)
      users.create.mockResolvedValue(user({ emailVerifiedAt: null }))

      await service.signUp({ name: 'Ana', email: 'ana@ifce.edu.br' })

      expect(users.create).toHaveBeenCalledWith({
        data: { name: 'Ana', email: 'ana@ifce.edu.br' },
      })
      expect(otp.issue).toHaveBeenCalledWith('user-1', 'SIGN_UP')
      expect(mail.sendOtpCode).toHaveBeenCalledWith({
        to: 'ana@ifce.edu.br',
        code: '123456',
        purpose: 'SIGN_UP',
        expiresInMinutes: 10,
      })
    })

    it('dá 409 para e-mail verificado', async () => {
      users.findUnique.mockResolvedValue(user())
      expect(await appError(service.signUp({ name: 'Ana', email: 'ana@ifce.edu.br' }))).toEqual({
        status: 409,
        code: 'EMAIL_ALREADY_REGISTERED',
      })
    })

    it('reenvia para não verificado, atualizando o nome', async () => {
      users.findUnique.mockResolvedValue(user({ emailVerifiedAt: null }))
      users.update.mockResolvedValue(user({ emailVerifiedAt: null, name: 'Ana Maria' }))

      await service.signUp({ name: 'Ana Maria', email: 'ana@ifce.edu.br' })

      expect(users.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'Ana Maria' },
      })
      expect(otp.issue).toHaveBeenCalledWith('user-1', 'SIGN_UP')
    })

    it('dá 429 dentro do intervalo', async () => {
      users.findUnique.mockResolvedValue(user({ emailVerifiedAt: null }))
      otp.isInCooldown.mockResolvedValue(true)
      expect(await appError(service.signUp({ name: 'Ana', email: 'ana@ifce.edu.br' }))).toEqual({
        status: 429,
        code: 'OTP_COOLDOWN',
      })
      expect(otp.issue).not.toHaveBeenCalled()
    })

    it('dá 503 quando o e-mail falha', async () => {
      users.findUnique.mockResolvedValue(null)
      users.create.mockResolvedValue(user({ emailVerifiedAt: null }))
      mail.sendOtpCode.mockRejectedValue(new Error('smtp'))
      expect(await appError(service.signUp({ name: 'Ana', email: 'ana@ifce.edu.br' }))).toEqual({
        status: 503,
        code: 'EMAIL_SEND_FAILED',
      })
    })
  })

  describe('requestCode', () => {
    it('envia SIGN_IN para usuário verificado', async () => {
      users.findUnique.mockResolvedValue(user())
      await service.requestCode('ana@ifce.edu.br')
      expect(otp.issue).toHaveBeenCalledWith('user-1', 'SIGN_IN')
    })

    it.each([
      ['inexistente', null, false],
      ['inativo', user({ isActive: false }), false],
      ['no intervalo', user(), true],
    ])('não faz nada para usuário %s', async (_label, found, cooldown) => {
      users.findUnique.mockResolvedValue(found)
      otp.isInCooldown.mockResolvedValue(cooldown)
      await expect(service.requestCode('x@y.dev')).resolves.toBeUndefined()
      expect(otp.issue).not.toHaveBeenCalled()
    })
  })

  describe('signIn', () => {
    it('devolve token, usuário e sessão', async () => {
      users.findUnique.mockResolvedValue(user())
      otp.consume.mockResolvedValue({ purpose: 'SIGN_IN' })

      const result = await service.signIn({ email: 'ana@ifce.edu.br', code: '123456' })

      expect(result.accessToken).toBe('jwt')
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'ana@ifce.edu.br',
        name: 'Ana',
        systemRole: 'USER',
      })
      expect(result.session.refreshToken).toBe('rt')
      expect(users.update).not.toHaveBeenCalled()
    })

    it('código SIGN_UP preenche emailVerifiedAt', async () => {
      users.findUnique.mockResolvedValue(user({ emailVerifiedAt: null }))
      users.update.mockResolvedValue(user())
      otp.consume.mockResolvedValue({ purpose: 'SIGN_UP' })

      await service.signIn({ email: 'ana@ifce.edu.br', code: '123456' })

      expect(users.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerifiedAt: expect.any(Date) as Date },
      })
    })

    it.each([
      ['inexistente', null],
      ['inativo', user({ isActive: false })],
      ['com código errado', user()],
    ])('dá o mesmo 401 para usuário %s', async (_label, found) => {
      users.findUnique.mockResolvedValue(found)
      otp.consume.mockResolvedValue(null)
      expect(await appError(service.signIn({ email: 'x@y.dev', code: '000000' }))).toEqual({
        status: 401,
        code: 'INVALID_OR_EXPIRED_CODE',
      })
      expect(sessions.create).not.toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    it('dá 401 sem cookie ou com token recusado', async () => {
      expect((await appError(service.refresh(undefined))).status).toBe(401)
      sessions.rotate.mockResolvedValue(null)
      expect((await appError(service.refresh('rt'))).status).toBe(401)
    })

    it('devolve token novo e a sessão girada', async () => {
      sessions.rotate.mockResolvedValue({
        userId: 'user-1',
        refreshToken: 'novo',
        expiresAt: new Date(),
      })
      const result = await service.refresh('rt')
      expect(result.accessToken).toBe('jwt')
      expect(result.session.refreshToken).toBe('novo')
    })
  })

  it('logout sem cookie não revoga nada', async () => {
    await service.logout(undefined)
    expect(sessions.revoke).not.toHaveBeenCalled()
  })

  it('me dá 401 para usuário inativo', async () => {
    users.findUnique.mockResolvedValue(user({ isActive: false }))
    expect(await appError(service.me('user-1'))).toEqual({ status: 401, code: 'UNAUTHORIZED' })
  })
})
