import { Body, Controller, Param, Put } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { RequireSystemRole } from '@modules/auth/decorators/require-system-role.decorator'
import { emailSchema } from '@modules/auth/schemas/auth.schemas'

import { setSystemRoleSchema, type SetSystemRoleInput } from './schemas/system-role.schemas'
import { UsersService } from './users.service'

@RequireSystemRole('MASTER')
@Controller('support/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Put(':email/system-role')
  setSystemRole(
    @Param('email', new ZodValidationPipe(emailSchema)) email: string,
    @Body(new ZodValidationPipe(setSystemRoleSchema)) body: SetSystemRoleInput,
  ) {
    return this.users.setSystemRole(email, body)
  }
}
