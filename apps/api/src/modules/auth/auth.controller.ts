import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { Env } from '@config/env.schema'

import { AuthService } from './auth.service'
import { REFRESH_COOKIE, refreshCookieOptions } from './auth.constants'
import { CurrentUser } from './decorators/current-user.decorator'
import { Public } from './decorators/public.decorator'
import type { JwtPayload } from './jwt-payload'
import {
  requestCodeSchema,
  signInSchema,
  signUpSchema,
  type RequestCodeInput,
  type SignInInput,
  type SignUpInput,
} from './schemas/auth.schemas'
import type { IssuedSession } from './session.service'

@Controller('auth')
export class AuthController {
  private readonly cookieOptions

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieOptions = refreshCookieOptions(
      config.get('NODE_ENV', { infer: true }) === 'production',
      config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }),
    )
  }

  @Public()
  @Post('sign-up')
  @HttpCode(HttpStatus.ACCEPTED)
  async signUp(@Body(new ZodValidationPipe(signUpSchema)) body: SignUpInput) {
    await this.auth.signUp(body)
  }

  @Public()
  @Post('code')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestCode(@Body(new ZodValidationPipe(requestCodeSchema)) body: RequestCodeInput) {
    await this.auth.requestCode(body.email)
  }

  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body(new ZodValidationPipe(signInSchema)) body: SignInInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user, session } = await this.auth.signIn(body)
    this.setRefreshCookie(res, session)
    return { accessToken, user }
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const { accessToken, session } = await this.auth.refresh(readRefreshCookie(req))
      this.setRefreshCookie(res, session)
      return { accessToken }
    } catch (error) {
      this.clearRefreshCookie(res)
      throw error
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readRefreshCookie(req))
    this.clearRefreshCookie(res)
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user.sub)
  }

  private setRefreshCookie(res: Response, { refreshToken }: IssuedSession) {
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions)
  }

  private clearRefreshCookie(res: Response) {
    // O Express 5 ignora maxAge no clearCookie; path e os demais atributos precisam bater.
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions)
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined
  return cookies?.[REFRESH_COOKIE]
}
