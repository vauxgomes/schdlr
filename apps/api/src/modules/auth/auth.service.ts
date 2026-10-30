import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { User } from '@prisma/client'

import { DatabaseService } from '@infra/database/database.service'
import { MailService } from '@infra/mail/mail.service'

import { AuthUser, toAuthUser } from './auth-user'
import { OTP_TTL_MINUTES } from './auth.constants'
import { JwtPayload } from './jwt-payload'
import { OtpService } from './otp.service'
import { SignInInput, SignUpInput } from './schemas/auth.schemas'
import { IssuedSession, SessionService } from './session.service'

export type SignInResult = { accessToken: string; user: AuthUser; session: IssuedSession }
export type RefreshResult = { accessToken: string; session: IssuedSession }

const invalidCode = () =>
  new UnauthorizedException({ statusCode: 401, message: 'Invalid or expired code' })

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly database: DatabaseService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
  ) {}

  async signUp({ name, email }: SignUpInput): Promise<void> {
    const existing = await this.database.user.findUnique({ where: { email } })

    if (existing?.emailVerifiedAt) {
      throw new ConflictException({ statusCode: 409, message: 'Email already registered' })
    }
    if (existing && (await this.otp.isInCooldown(existing.id))) {
      throw new HttpException(
        { statusCode: 429, message: 'Wait before requesting a new code' },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    // Usuário que se cadastra sozinho nasce sem assinatura (spec 0002).
    const user = existing
      ? await this.database.user.update({ where: { id: existing.id }, data: { name } })
      : await this.database.user.create({ data: { name, email } })

    await this.sendCode(user)
  }

  /** Responde igual exista o e-mail ou não, para não revelar quem tem conta. */
  async requestCode(email: string): Promise<void> {
    const user = await this.database.user.findUnique({ where: { email } })
    if (!user?.isActive || (await this.otp.isInCooldown(user.id))) return
    await this.sendCode(user)
  }

  async signIn({ email, code }: SignInInput): Promise<SignInResult> {
    const user = await this.database.user.findUnique({ where: { email } })
    if (!user?.isActive) throw invalidCode()

    const consumed = await this.otp.consume(user.id, code)
    if (!consumed) throw invalidCode()

    const signedIn =
      consumed.purpose === 'SIGN_UP' && !user.emailVerifiedAt
        ? await this.database.user.update({
            where: { id: user.id },
            data: { emailVerifiedAt: new Date() },
          })
        : user

    return {
      accessToken: this.signAccessToken(user.id),
      user: toAuthUser(signedIn),
      session: await this.sessions.create(user.id),
    }
  }

  async refresh(refreshToken: string | undefined): Promise<RefreshResult> {
    const rotated = refreshToken ? await this.sessions.rotate(refreshToken) : null
    if (!rotated) throw new UnauthorizedException()

    const { userId, ...session } = rotated
    return { accessToken: this.signAccessToken(userId), session }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.sessions.revoke(refreshToken)
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.database.user.findUnique({ where: { id: userId } })
    if (!user?.isActive) throw new UnauthorizedException()
    return toAuthUser(user)
  }

  private async sendCode(user: User): Promise<void> {
    const purpose = user.emailVerifiedAt ? 'SIGN_IN' : 'SIGN_UP'
    const { code } = await this.otp.issue(user.id, purpose)
    try {
      await this.mail.sendOtpCode({
        to: user.email,
        code,
        purpose,
        expiresInMinutes: OTP_TTL_MINUTES,
      })
    } catch {
      // O MailService já registrou o erro; o usuário pede o código de novo.
      throw new ServiceUnavailableException({ statusCode: 503, message: 'Could not send email' })
    }
  }

  private signAccessToken(userId: string): string {
    const payload: JwtPayload = { sub: userId }
    return this.jwt.sign(payload)
  }
}
