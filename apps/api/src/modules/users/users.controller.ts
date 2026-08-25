import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Validate } from '../../common/decorators/validate.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import { readRefreshCookie } from '../auth/refresh-cookie'
import type { AuthenticatedUser } from '../auth/jwt.strategy'
import { ChangePasswordSchema } from './dto/change-password.dto'
import { UpdateProfileSchema } from './dto/update-profile.dto'
import type { ChangePasswordInput } from './dto/change-password.dto'
import type { UpdateProfileInput } from './dto/update-profile.dto'
import { UsersService } from './users.service'

@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.profile(user.userId)
  }

  @Patch()
  @Validate(UpdateProfileSchema)
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateProfileInput) {
    return this.usersService.updateProfile(user.userId, input)
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Validate(ChangePasswordSchema)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ChangePasswordInput,
    @Req() request: Request,
  ) {
    return this.usersService.changePassword(user.userId, input, readRefreshCookie(request))
  }
}
