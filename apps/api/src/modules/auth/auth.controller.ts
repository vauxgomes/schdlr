import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import { Public } from '../../common/decorators/public.decorator'
import { Validate } from '../../common/decorators/validate.decorator'
import { Env } from '../../config/env'
import { AuthService, RequestMeta } from './auth.service'
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './utils/refresh-cookie'
import { ForgotPasswordSchema } from './dto/forgot-password.dto'
import { LoginSchema } from './dto/login.dto'
import { RegisterSchema } from './dto/register.dto'
import { ResetPasswordSchema } from './dto/reset-password.dto'
import type { ForgotPasswordInput } from './dto/forgot-password.dto'
import type { LoginInput } from './dto/login.dto'
import type { RegisterInput } from './dto/register.dto'
import type { ResetPasswordInput } from './dto/reset-password.dto'

function requestMeta(request: Request): RequestMeta {
  return { userAgent: request.get('user-agent'), ipAddress: request.ip }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('register')
  @Validate(RegisterSchema)
  register(@Body() input: RegisterInput) {
    return this.authService.register(input)
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Validate(LoginSchema)
  async login(
    @Body() input: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { refreshToken, ...result } = await this.authService.login(input, requestMeta(request))

    setRefreshCookie(response, refreshToken, this.config)

    return result
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { accessToken, refreshToken } = await this.authService.refresh(
      readRefreshCookie(request),
      requestMeta(request),
    )

    setRefreshCookie(response, refreshToken, this.config)

    return { accessToken }
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Validate(ForgotPasswordSchema)
  forgotPassword(@Body() input: ForgotPasswordInput) {
    return this.authService.forgotPassword(input)
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Validate(ResetPasswordSchema)
  resetPassword(@Body() input: ResetPasswordInput) {
    return this.authService.resetPassword(input)
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(readRefreshCookie(request))

    clearRefreshCookie(response, this.config)
  }
}
