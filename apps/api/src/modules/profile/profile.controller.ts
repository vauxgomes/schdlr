import { Body, Controller, Get, Patch } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import { ProfileService } from './profile.service'
import { updateProfileSchema, type UpdateProfileInput } from './schemas/profile.schemas'

/** Sempre o usuário do token: não há como ver ou editar o perfil de outra pessoa por aqui. */
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.profile.get(user.sub)
  }

  @Patch()
  update(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.profile.update(user.sub, body)
  }
}
