import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { JwtService } from '@nestjs/jwt'
import { Prisma, StaffRole } from '@prisma/client'
import { compare, hash } from 'bcrypt'
import { createHash, randomBytes } from 'node:crypto'
import { Env } from '../../config/env'
import { DatabaseService } from '../../infra/database/database.service'
import {
  MailEvent,
  PasswordResetMailPayload,
  WelcomeMailPayload,
} from '../../infra/mail/mail.events'
import { ForgotPasswordInput } from './dto/forgot-password.dto'
import { LoginInput } from './dto/login.dto'
import { ResetPasswordInput } from './dto/reset-password.dto'
import { RegisterInput } from './dto/register.dto'

const BCRYPT_COST = 10
const UNIQUE_VIOLATION = 'P2002'
const INVALID_CREDENTIALS = 'Invalid credentials'
const INVALID_SESSION = 'Invalid session'

// Hash descartável de uma senha arbitrária. Serve para gastar o mesmo tempo de
// bcrypt quando o e-mail não existe: sem isso, a diferença de latência entre
// "não achei o usuário" e "senha errada" confirma quais e-mails têm conta.
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.z7VfQrmZ9pRAqmMS2W1cGDKMYYzm'

const PUBLIC_USER = {
  id: true,
  name: true,
  email: true,
  staffRole: true,
  createdAt: true,
} satisfies Prisma.UserSelect

export type RequestMeta = {
  userAgent?: string
  ipAddress?: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly events: EventEmitter2,
  ) {}

  async register(input: RegisterInput) {
    try {
      const user = await this.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hash(input.password, BCRYPT_COST),
          subscription: { create: {} },
        },
        select: PUBLIC_USER,
      })

      const welcome: WelcomeMailPayload = { name: user.name, email: user.email }

      this.events.emit(MailEvent.Welcome, welcome)

      return user
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Email already registered')
      }

      throw error
    }
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const user = await this.db.user.findUnique({ where: { email: input.email } })
    const passwordMatches = await compare(input.password, user?.passwordHash ?? DUMMY_HASH)

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS)
    }

    const tokens = await this.issueTokens(user, meta)

    return { ...tokens, user: await this.publicUser(user.id) }
  }

  async refresh(rawToken: string | undefined, meta: RequestMeta) {
    if (!rawToken) throw new UnauthorizedException(INVALID_SESSION)

    const stored = await this.db.refreshToken.findUnique({
      where: { token: this.hashToken(rawToken) },
      include: { user: true },
    })

    if (!stored || stored.revokedAt || stored.expiresAt <= new Date() || !stored.user.isActive) {
      throw new UnauthorizedException(INVALID_SESSION)
    }

    // Revoga antes de emitir: se algo falhar no meio, o pior caso é a sessão
    // cair, e não um token consumido continuar valendo.
    await this.db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    return this.issueTokens(stored.user, meta)
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return

    await this.db.refreshToken.updateMany({
      where: { token: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  // Sem retorno e sem erro, exista ou não o e-mail: qualquer diferença aqui
  // transformaria o endpoint num enumerador de quem usa o produto.
  async forgotPassword(input: ForgotPasswordInput) {
    const user = await this.db.user.findUnique({ where: { email: input.email } })

    if (!user || !user.isActive) return

    const token = randomBytes(32).toString('hex')
    const expiresInMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true })

    await this.db.passwordReset.create({
      data: {
        token: this.hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
      },
    })

    const webAppUrl = this.config.get('WEB_APP_URL', { infer: true })
    const payload: PasswordResetMailPayload = {
      name: user.name,
      email: user.email,
      resetUrl: `${webAppUrl}/reset-password?token=${token}`,
      expiresInMinutes,
    }

    this.events.emit(MailEvent.PasswordReset, payload)
  }

  async resetPassword(input: ResetPasswordInput) {
    const reset = await this.db.passwordReset.findUnique({
      where: { token: this.hashToken(input.token) },
      include: { user: true },
    })

    if (!reset || reset.usedAt || reset.expiresAt <= new Date() || !reset.user.isActive) {
      throw new BadRequestException('Invalid or expired token')
    }

    const passwordHash = await hash(input.password, BCRYPT_COST)
    const now = new Date()

    // Marcar o token, trocar a senha e derrubar as sessões precisam valer
    // juntos: se a recuperação foi feita por conta comprometida, um refresh
    // token sobrevivente anularia o efeito da troca.
    await this.db.$transaction([
      this.db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: now } }),
      this.db.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      this.db.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ])
  }

  private async issueTokens(user: { id: string; staffRole: StaffRole | null }, meta: RequestMeta) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, staffRole: user.staffRole })
    const refreshToken = randomBytes(32).toString('hex')
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true })

    await this.db.refreshToken.create({
      data: {
        token: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    })

    return { accessToken, refreshToken }
  }

  private publicUser(id: string) {
    return this.db.user.findUniqueOrThrow({ where: { id }, select: PUBLIC_USER })
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }
}
