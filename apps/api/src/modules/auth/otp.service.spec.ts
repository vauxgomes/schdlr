import { ConfigService } from '@nestjs/config'
import { OtpCode } from '@prisma/client'

import { Env } from '@config/env.schema'
import { DatabaseService } from '@infra/database/database.service'

import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS } from './auth.constants'
import { OtpService } from './otp.service'

const config = { get: () => 'x'.repeat(32) } as unknown as ConfigService<Env, true>

function otpRow(service: OtpService, code: string, overrides: Partial<OtpCode> = {}): OtpCode {
  return {
    id: 'otp-1',
    userId: 'user-1',
    purpose: 'SIGN_IN',
    codeHash: service.hash(code),
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('OtpService', () => {
  let otpCode: Record<'create' | 'findFirst' | 'findMany' | 'update' | 'updateMany', jest.Mock>
  let service: OtpService

  beforeEach(() => {
    otpCode = {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    }
    service = new OtpService({ otpCode } as unknown as DatabaseService, config)
  })

  it('emite 6 dígitos e grava só o HMAC', async () => {
    const issued = await service.issue('user-1', 'SIGN_UP')

    expect(issued.code).toMatch(/^\d{6}$/)
    const [{ data }] = otpCode.create.mock.calls[0] as [{ data: Record<string, unknown> }]
    expect(data.codeHash).toBe(service.hash(issued.code))
    expect(data.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(data)).not.toContain(`"${issued.code}"`)
  })

  it('o hash depende do segredo', () => {
    const other = new OtpService(
      {} as DatabaseService,
      {
        get: () => 'y'.repeat(32),
      } as unknown as ConfigService<Env, true>,
    )
    expect(other.hash('123456')).not.toBe(service.hash('123456'))
  })

  describe('consume', () => {
    it('consome o código certo', async () => {
      const row = otpRow(service, '123456')
      otpCode.findFirst.mockResolvedValue(row)

      await expect(service.consume('user-1', '123456')).resolves.toBe(row)
      expect(otpCode.updateMany).toHaveBeenCalledWith({
        where: { id: 'otp-1', consumedAt: null },
        data: { consumedAt: expect.any(Date) as Date },
      })
    })

    it('código errado soma uma tentativa', async () => {
      otpCode.findFirst.mockResolvedValue(otpRow(service, '123456'))

      await expect(service.consume('user-1', '000000')).resolves.toBeNull()
      expect(otpCode.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { attempts: { increment: 1 } },
      })
    })

    it.each([
      ['vencido', { expiresAt: new Date(Date.now() - 1) }],
      ['já usado', { consumedAt: new Date() }],
      ['esgotado', { attempts: OTP_MAX_ATTEMPTS }],
    ])('recusa código %s, mesmo certo', async (_label, overrides) => {
      otpCode.findFirst.mockResolvedValue(otpRow(service, '123456', overrides))

      await expect(service.consume('user-1', '123456')).resolves.toBeNull()
      expect(otpCode.update).not.toHaveBeenCalled()
    })

    it('só olha o código mais recente do usuário', async () => {
      otpCode.findFirst.mockResolvedValue(null)
      await service.consume('user-1', '123456')
      expect(otpCode.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      })
    })

    it('não consome duas vezes num sign-in simultâneo', async () => {
      otpCode.findFirst.mockResolvedValue(otpRow(service, '123456'))
      otpCode.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.consume('user-1', '123456')).resolves.toBeNull()
    })
  })

  it('respeita o intervalo entre emissões', async () => {
    otpCode.findFirst.mockResolvedValue({ createdAt: new Date() })
    await expect(service.isInCooldown('user-1')).resolves.toBe(true)

    const old = new Date(Date.now() - (OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000)
    otpCode.findFirst.mockResolvedValue({ createdAt: old })
    await expect(service.isInCooldown('user-1')).resolves.toBe(false)
  })

  it('findLatestUsable ignora código que não é o mais recente do dono', async () => {
    const stale = otpRow(service, '111111', { id: 'old', userId: 'user-1' })
    const fresh = otpRow(service, '222222', { id: 'new', userId: 'user-2' })
    otpCode.findMany.mockResolvedValue([stale, fresh])
    otpCode.findFirst.mockImplementation(({ where }: { where: { userId: string } }) =>
      Promise.resolve(
        where.userId === 'user-1' ? otpRow(service, '333333', { id: 'newer' }) : fresh,
      ),
    )

    await expect(service.findLatestUsable()).resolves.toBe(fresh)
  })
})
