import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import { MembersService } from './members.service'
import { updateMemberSchema, type UpdateMemberInput } from './schemas/member.schemas'

// Os slugs do caminho são validados pelo TenantAccessService: fora do formato dá 404, não 400.
@Controller('organizations/:orgSlug/units/:unitSlug/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.members.list(user.sub, orgSlug, unitSlug)
  }

  @Patch(':userId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.members.update(user.sub, orgSlug, unitSlug, userId, body)
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.members.remove(user.sub, orgSlug, unitSlug, userId)
  }
}
