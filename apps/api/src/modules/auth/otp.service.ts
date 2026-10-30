import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OtpCode, OtpPurpose } from '@prisma/client'

import { Env } from '@config/env.schema'
import { DatabaseService } from '@infra/database/database.service'

import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
} from './auth.constants'

export type IssuedOtp = { code: string; purpose: OtpPurpose; expiresAt: Date }

@Injectable()
export class OtpService {
  private readonly secret: string

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('JWT_SECRET', { infer: true })
  }

  /** HMAC com chave fora do banco: hash puro de 6 dígitos se quebra em segundos. */
  hash(code: string): string {
    return createHmac('sha256', this.secret).update(code).digest('hex')
  }

  async issue(userId: string, purpose: OtpPurpose): Promise<IssuedOtp> {
    const code = randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0')
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000)
    await this.database.otpCode.create({
      data: { userId, purpose, codeHash: this.hash(code), expiresAt },
    })
    return { code, purpose, expiresAt }
  }

  /** O intervalo conta do último código emitido, usado ou não. */
  async isInCooldown(userId: string): Promise<boolean> {
    const last = await this.database.otpCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    return !!last && Date.now() - last.createdAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000
  }

  /** Só o código mais recente do usuário vale, e só enquanto não usado, vencido ou esgotado. */
  async findUsable(userId: string): Promise<OtpCode | null> {
    const latest = await this.database.otpCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return latest && isUsable(latest) ? latest : null
  }

  /** O código utilizável mais recente do banco inteiro, de qualquer usuário. */
  async findLatestUsable(): Promise<OtpCode | null> {
    const candidates = await this.database.otpCode.findMany({
      where: {
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: OTP_MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    for (const candidate of candidates) {
      const usable = await this.findUsable(candidate.userId)
      if (usable?.id === candidate.id) return usable
    }
    return null
  }

  /**
   * Confere o código contra o utilizável do usuário. Errado soma uma tentativa; certo marca
   * `consumedAt`. Devolve o código consumido, ou null.
   */
  async consume(userId: string, code: string): Promise<OtpCode | null> {
    const usable = await this.findUsable(userId)
    if (!usable) return null

    if (!this.matches(code, usable.codeHash)) {
      await this.database.otpCode.update({
        where: { id: usable.id },
        data: { attempts: { increment: 1 } },
      })
      return null
    }

    // `consumedAt: null` no filtro: dois sign-in simultâneos não consomem o mesmo código.
    const { count } = await this.database.otpCode.updateMany({
      where: { id: usable.id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    return count === 1 ? usable : null
  }

  private matches(code: string, codeHash: string): boolean {
    const expected = Buffer.from(codeHash, 'hex')
    const actual = Buffer.from(this.hash(code), 'hex')
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }
}

function isUsable(otp: OtpCode): boolean {
  return !otp.consumedAt && otp.expiresAt > new Date() && otp.attempts < OTP_MAX_ATTEMPTS
}
