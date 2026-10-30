import { createHash, randomBytes } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { Env } from '@config/env.schema'
import { DatabaseService } from '@infra/database/database.service'

export type IssuedSession = { refreshToken: string; expiresAt: Date }

/** Refresh token opaco: no banco vai só o SHA-256, que basta para um valor de 256 bits. */
@Injectable()
export class SessionService {
  private readonly ttlDays: number

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlDays = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true })
  }

  async create(userId: string): Promise<IssuedSession> {
    const refreshToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000)
    await this.database.refreshToken.create({
      data: { userId, tokenHash: hashToken(refreshToken), expiresAt },
    })
    return { refreshToken, expiresAt }
  }

  /**
   * Revoga o token usado e emite outro. Devolve null se o token não serve; reuso de token já
   * revogado derruba todas as sessões do usuário, porque é sinal de vazamento.
   */
  async rotate(refreshToken: string): Promise<(IssuedSession & { userId: string }) | null> {
    const stored = await this.database.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { select: { isActive: true } } },
    })
    if (!stored) return null

    if (stored.revokedAt) {
      await this.revokeAll(stored.userId)
      return null
    }
    if (stored.expiresAt <= new Date() || !stored.user.isActive) return null

    // `revokedAt: null` no filtro: dois refresh simultâneos com o mesmo token contam como reuso.
    const { count } = await this.database.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (count === 0) {
      await this.revokeAll(stored.userId)
      return null
    }

    return { userId: stored.userId, ...(await this.create(stored.userId)) }
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.database.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  private async revokeAll(userId: string): Promise<void> {
    await this.database.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
